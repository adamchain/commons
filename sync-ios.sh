#!/bin/bash
set -e

cd "$(dirname "$0")/client"

echo "Building and syncing to Xcode..."
npm run ios:sync

echo "Opening Xcode..."
open ios/App/App.xcworkspace
