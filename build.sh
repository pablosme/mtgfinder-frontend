#!/bin/bash
docker buildx build --platform linux/arm64 -t pablosme/mtgfinder:frontend --push .
docker push pablosme/mtgfinder:frontend
