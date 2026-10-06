# MtgfinderFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.24.

## Camera card scanning

Use the camera button beside the search input, choose the card's printed language, and
capture one upright card with all four corners visible. A plain contrasting background,
sharp focus, and even lighting help detection. OpenCV.js detects the card outline and
applies a four-point perspective transform to a **744 × 1040 PNG**. Tesseract.js reads the
title region using grayscale and thresholded crops. Review or edit the name, download
the normalized image, then choose **Use card** to fill the existing search input.

The dialog returns `CardScanResult`, also exposed through the search component's
`cardScanned` output and `scannedCard` signal. It contains `name`, `normalizedImage`
(a PNG data URL), `width`, `height`, `language`, `rawText` (the original title OCR), and
`confidence` (0–100, or null if OCR did not run or failed). Editing the name does not
change the original OCR confidence. Cancelling the dialog returns no result.

OCR models are included for English, Spanish, French, German, Italian, Portuguese,
Japanese, Korean, Russian, simplified and traditional Chinese, Arabic, Hebrew, Latin,
Ancient Greek, and Sanskrit. **Phyrexian requires manual name entry**; image normalization
still works. Choose a language explicitly; only its model is loaded for a scan.

OpenCV, OCR worker/WASM files, and language models are copied from pinned npm packages
into local build assets. They load on demand, and card images are processed in the
browser. Camera access requires HTTPS or localhost and permission. Workers and camera
tracks are released when the dialog closes; language downloads can be cancelled.

This is printed-title OCR, not card identification or translation. Names may need
correction, and a non-English name may not match an English-only search index. Split,
rotated, borderless, showcase, or unusually positioned titles may need manual entry.
Rules text and secondary card faces are not extracted. A failed OCR attempt preserves
the normalized image for manual review; a failed outline detection asks for a retake.

Implementation references: [OpenCV perspective transforms](https://docs.opencv.org/4.x/dd/d52/tutorial_js_geometric_transformations.html),
[Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md), and
[Tesseract language data](https://github.com/naptha/tessdata/blob/gh-pages/README.md).

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project with the local environment run:

```bash
ng build
```

This compiles your project with the localhost environment and stores the build artifacts in the `dist/` directory. To create an optimized production build, run `ng build --configuration production`.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
