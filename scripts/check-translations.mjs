#!/usr/bin/env node
/**
 * Translation quality checks.
 *
 * - Every JSON file under public/i18n is valid and contains no duplicate keys.
 * - Every translation key referenced from source exists in its scope file.
 * - Every translation key defined in JSON is referenced somewhere in source.
 * - Scope aliases declared in the routes point to existing scope files.
 * - Templates contain no hard-coded user-facing text or text attributes.
 *
 * Run with `npm run i18n:check`. Exit code 1 means at least one problem was found.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const i18nDir = join(root, 'public', 'i18n');
const srcDir = join(root, 'src');
const routesFile = join(srcDir, 'app', 'core', 'routing', 'app.routes.ts');

/**
 * Text deliberately left untranslated in templates: raw search syntax, keyboard keys,
 * symbols and the example search term used in the guide.
 */
const HARDCODED_ALLOWLIST = new Set([
    'Dragon',
    'Enter',
    'Esc',
    '/',
    '=',
    '↑',
    '↓',
    '›',
    '·',
    '—',
    '←',
    '→',
]);
/** Elements whose content is protected, raw syntax and never translated. */
const PROTECTED_ELEMENTS = ['code', 'kbd', 'pre', 'script', 'style'];
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder', 'label'];

const problems = [];
const fail = (message) => problems.push(message);

function walk(dir, predicate, out = []) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path, predicate, out);
        else if (predicate(path)) out.push(path);
    }
    return out;
}

const rel = (path) => relative(root, path).split(sep).join('/');

/** Detects duplicate keys inside a single JSON object, which JSON.parse silently accepts. */
function findDuplicateKeys(text) {
    const duplicates = [];
    const stack = [];
    const pathOf = () =>
        stack
            .slice(0, -1)
            .map((frame) => frame.key)
            .filter(Boolean)
            .join('.');
    const tokens = /"(?:\\.|[^"\\])*"|[{}[\]:,]|[^\s"{}[\]:,]+/g;
    let previous = null;
    let token;
    while ((token = tokens.exec(text))) {
        const value = token[0];
        if (value === '{') {
            stack.push({ keys: new Set(), key: null, array: false });
        } else if (value === '[') {
            stack.push({ keys: new Set(), key: null, array: true });
        } else if (value === '}' || value === ']') {
            stack.pop();
        } else if (value === ':') {
            const frame = stack[stack.length - 1];
            if (frame && previous?.startsWith('"')) {
                const key = JSON.parse(previous);
                if (frame.keys.has(key)) duplicates.push([pathOf(), key].filter(Boolean).join('.'));
                frame.keys.add(key);
                frame.key = key;
            }
        }
        previous = value;
    }
    return duplicates;
}

function flatten(object, prefix = '') {
    const keys = [];
    for (const [key, value] of Object.entries(object)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object') keys.push(...flatten(value, path));
        else keys.push(path);
    }
    return keys;
}

// --- Supported languages -------------------------------------------------------------
const supportedLangText = readFileSync(
    join(srcDir, 'app', 'core', 'i18n', 'supported-languages.ts'),
    'utf8',
);
const supportedLangs = [...supportedLangText.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);

function extractParams(str) {
    if (typeof str !== 'string') return '';
    const matches = [...str.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    return matches.sort().join(',');
}

// --- Load translation files -------------------------------------------------------------
const scopes = new Map(); // scope path ('' for root) -> Set<key>
const enParams = new Map(); // `${scope}|${key}` -> string of sorted param names
const nonEnFiles = [];

for (const file of walk(i18nDir, (path) => path.endsWith('.json'))) {
    const text = readFileSync(file, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        fail(`${rel(file)}: invalid JSON (${error.message})`);
        continue;
    }
    for (const duplicate of findDuplicateKeys(text))
        fail(`${rel(file)}: duplicate key "${duplicate}"`);

    const subPath = rel(file).replace(/^public\/i18n\/?/, '');
    const parts = subPath.split('/');
    const fileName = parts.pop();
    const lang = fileName.replace(/\.json$/, '');
    const scopePath = parts.join('/');

    if (!supportedLangs.includes(lang)) {
        fail(`${rel(file)}: unknown language code "${lang}"`);
        continue;
    }

    const flatKeys = flatten(parsed);
    for (const key of flatKeys) {
        const value = key.split('.').reduce((node, part) => node?.[part], parsed);
        if (typeof value !== 'string' || value.trim() === '')
            fail(`${rel(file)}: empty value for "${key}"`);
    }

    if (lang === 'en') {
        scopes.set(scopePath, new Set(flatKeys));
        for (const key of flatKeys) {
            const value = key.split('.').reduce((node, part) => node?.[part], parsed);
            enParams.set(`${scopePath}|${key}`, extractParams(value));
        }
    } else {
        nonEnFiles.push({ file, scopePath, lang, parsed, keys: new Set(flatKeys) });
    }
}

if (!scopes.has('')) fail('public/i18n/en.json is missing');

// Verify all supported languages have files for every canonical scope
for (const scope of scopes.keys()) {
    for (const lang of supportedLangs) {
        const expected = join(i18nDir, scope, `${lang}.json`);
        if (!existsSync(expected)) {
            fail(`missing translation file: public/i18n/${scope ? `${scope}/` : ''}${lang}.json`);
        }
    }
}

// Verify parity for non-English translation files against English
for (const { file, scopePath, lang, parsed, keys } of nonEnFiles) {
    const canonicalKeys = scopes.get(scopePath);
    if (!canonicalKeys) {
        fail(`${rel(file)}: scope "${scopePath}" does not exist in English`);
        continue;
    }
    for (const key of canonicalKeys) {
        if (!keys.has(key)) {
            fail(`${rel(file)}: missing translation key "${key}"`);
        }
    }
    for (const key of keys) {
        if (!canonicalKeys.has(key)) {
            fail(`${rel(file)}: extraneous key "${key}" not in English`);
        } else {
            const expectedP = enParams.get(`${scopePath}|${key}`) ?? '';
            const value = key.split('.').reduce((node, part) => node?.[part], parsed);
            const actualP = extractParams(value);
            if (expectedP !== actualP) {
                fail(
                    `${rel(file)}: parameter mismatch for "${key}" (expected {{${expectedP.split(',').join('}}, {{')}}}, found {{${actualP.split(',').join('}}, {{')}}})`,
                );
            }
        }
    }
}

// --- Scope aliases ----------------------------------------------------------------------
const aliasToScope = new Map(); // alias -> scope path
const routesText = readFileSync(routesFile, 'utf8');
for (const match of routesText.matchAll(/scope:\s*'([^']+)'\s*,\s*alias:\s*'([^']+)'/g)) {
    aliasToScope.set(match[2], match[1]);
    if (!scopes.has(match[1]))
        fail(`${rel(routesFile)}: scope "${match[1]}" has no public/i18n/${match[1]}/en.json`);
}
for (const scope of scopes.keys()) {
    if (scope && ![...aliasToScope.values()].includes(scope)) {
        fail(`public/i18n/${scope}/en.json: scope is not provided by any route`);
    }
}
const rootNamespaces = new Set([...(scopes.get('') ?? [])].map((key) => key.split('.')[0]));

/** Resolves a referenced key to [scope path, key inside that scope]. */
function resolveKey(key) {
    const [head, ...rest] = key.split('.');
    if (aliasToScope.has(head)) return [aliasToScope.get(head), rest.join('.')];
    return ['', key];
}

// --- Collect references from source -------------------------------------------------------
const sourceFiles = walk(srcDir, (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'));
const references = new Map(); // `${scope}|${key}` -> files
const dynamicPrefixes = new Set(); // `${scope}|${prefix}.` keys referenced dynamically
const knownNamespaces = new Set([...rootNamespaces, ...aliasToScope.keys()]);
const literalPattern = /(['"`])((?:[A-Za-z][A-Za-z0-9_]*)(?:\.[A-Za-z][A-Za-z0-9_]*)+)(\.?)\1/g;

for (const file of sourceFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(
        /(['"`])([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\.?(\$\{[^}]*\}|\1)/g,
    )) {
        const key = match[2];
        const head = key.split('.')[0];
        if (!knownNamespaces.has(head) || !key.includes('.')) continue;
        if (match[3].startsWith('${') || match[0].endsWith('.' + match[1])) {
            const [scope, local] = resolveKey(key);
            dynamicPrefixes.add(`${scope}|${local}.`);
        }
    }
    for (const match of text.matchAll(literalPattern)) {
        const key = match[2];
        if (!knownNamespaces.has(key.split('.')[0])) continue;
        const [scope, local] = resolveKey(key);
        const id = `${scope}|${local}`;
        if (!references.has(id)) references.set(id, new Set());
        references.get(id).add(rel(file));
    }
    // Dynamic keys built with concatenation, e.g. 'mana.symbols.' + code
    for (const match of text.matchAll(
        /(['"`])((?:[A-Za-z][A-Za-z0-9_]*)(?:\.[A-Za-z][A-Za-z0-9_]*)*)\.\1\s*\+/g,
    )) {
        if (!knownNamespaces.has(match[2].split('.')[0])) continue;
        const [scope, local] = resolveKey(match[2]);
        dynamicPrefixes.add(`${scope}|${local}.`);
    }
    for (const match of text.matchAll(
        /(['"`])((?:[A-Za-z][A-Za-z0-9_]*)(?:\.[A-Za-z][A-Za-z0-9_]*)*)\.\$\{/g,
    )) {
        if (!knownNamespaces.has(match[2].split('.')[0])) continue;
        const [scope, local] = resolveKey(match[2]);
        dynamicPrefixes.add(`${scope}|${local}.`);
    }
}

for (const [id, files] of references) {
    const [scope, key] = id.split('|');
    if (!scopes.get(scope)?.has(key)) {
        fail(
            `missing key "${key}" in ${scope ? `public/i18n/${scope}` : 'public/i18n'}/en.json (used in ${[...files].join(', ')})`,
        );
    }
}

for (const [scope, keys] of scopes) {
    for (const key of keys) {
        const id = `${scope}|${key}`;
        if (references.has(id)) continue;
        const dynamic = [...dynamicPrefixes].some((prefix) => id.startsWith(prefix));
        if (!dynamic) fail(`unused key "${key}" in public/i18n/${scope ? `${scope}/` : ''}en.json`);
    }
}

// --- Hard-coded text in templates ----------------------------------------------------------
for (const file of sourceFiles.filter((path) => path.endsWith('.html'))) {
    if (file.endsWith('src/index.html')) continue; // static title/lang are handled by the runtime title service
    let text = readFileSync(file, 'utf8');
    text = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
    for (const element of PROTECTED_ELEMENTS) {
        text = text.replace(
            new RegExp(`<${element}\\b[^>]*>[\\s\\S]*?<\\/${element}\\s*>`, 'gi'),
            (m) => m.replace(/[^\n]/g, ' '),
        );
    }
    const line = (offset) => text.slice(0, offset).split('\n').length;

    // Text nodes
    for (const match of text.matchAll(/>([^<>]+)</g)) {
        const content = match[1]
            .replace(/\{\{[\s\S]*?\}\}/g, '')
            .replace(/&[a-z]+;/gi, ' ')
            .replace(/@(?:if|else|for|empty|switch|case|default)\b[^{}]*\{?/g, '')
            .replace(/[{}]/g, '')
            .trim();
        if (!/[A-Za-z]{2,}/.test(content)) continue;
        if (HARDCODED_ALLOWLIST.has(content)) continue;
        fail(
            `${rel(file)}:${line(match.index)}: hard-coded text "${content.replace(/\s+/g, ' ')}"`,
        );
    }
    // Attributes with literal user-facing text
    for (const attribute of TEXT_ATTRIBUTES) {
        for (const match of text.matchAll(
            new RegExp(`(?<![\\w\\[.-])${attribute}="([^"]*[A-Za-z]{2,}[^"]*)"`, 'g'),
        )) {
            fail(`${rel(file)}:${line(match.index)}: hard-coded ${attribute} "${match[1]}"`);
        }
    }
}

if (problems.length) {
    console.error(`Translation check failed with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(` - ${problem}`);
    process.exit(1);
}
console.log(
    `Translation check passed: ${[...scopes.values()].reduce((sum, keys) => sum + keys.size, 0)} keys in ${scopes.size} scope file(s).`,
);
