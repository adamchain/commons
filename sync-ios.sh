#!/bin/bash
set -e

cd "$(dirname "$0")/client"

echo "Cleaning previous build..."
rm -rf dist

echo "Building and syncing to Xcode..."
VITE_API_URL=https://www.oncommons.co npm run build
npx cap sync ios

echo "Opening Xcode..."
open ios/App/App.xcworkspace
