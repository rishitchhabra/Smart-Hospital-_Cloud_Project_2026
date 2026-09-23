#!/usr/bin/env bash
#
# Build a signed debug APK for the Thinkora WebView app WITHOUT Gradle,
# using only the Android SDK build-tools (aapt2, d8, zipalign, apksigner).
#
# Usage:  ./build.sh
# Output: mobile/output/thinkora.apk
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
BUILD_TOOLS="${BUILD_TOOLS:-$SDK/build-tools/35.0.0}"
PLATFORM="${PLATFORM:-$SDK/platforms/android-34/android.jar}"

AAPT2="$BUILD_TOOLS/aapt2"
D8="$BUILD_TOOLS/d8"
ZIPALIGN="$BUILD_TOOLS/zipalign"
APKSIGNER="$BUILD_TOOLS/apksigner"

MIN_SDK=23
TARGET_SDK=34
PKG_PATH="tech/thinkora/app"

BUILD="$HERE/build"
OUT="$HERE/output"
KEYSTORE="$HERE/debug.keystore"

echo "==> SDK:          $SDK"
echo "==> build-tools:  $BUILD_TOOLS"
echo "==> platform jar: $PLATFORM"

for tool in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER"; do
  [ -x "$tool" ] || { echo "ERROR: missing $tool"; exit 1; }
done
[ -f "$PLATFORM" ] || { echo "ERROR: missing $PLATFORM"; exit 1; }

rm -rf "$BUILD"
mkdir -p "$BUILD/compiled" "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$OUT"

echo "==> Compiling resources"
"$AAPT2" compile --dir "$HERE/res" -o "$BUILD/compiled/res.zip"

echo "==> Linking resources"
"$AAPT2" link \
  -o "$BUILD/app.unaligned.apk" \
  -I "$PLATFORM" \
  --manifest "$HERE/AndroidManifest.xml" \
  --java "$BUILD/gen" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code 1 \
  --version-name 1.0 \
  "$BUILD/compiled/res.zip"

echo "==> Compiling Java"
javac \
  --release 11 \
  -classpath "$PLATFORM" \
  -d "$BUILD/classes" \
  "$BUILD/gen/$PKG_PATH/R.java" \
  "$HERE/src/$PKG_PATH/MainActivity.java"

echo "==> Dexing"
"$D8" --release --lib "$PLATFORM" --min-api "$MIN_SDK" \
  --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class')

echo "==> Packaging"
cp "$BUILD/app.unaligned.apk" "$BUILD/app.packaged.apk"
( cd "$BUILD/dex" && zip -q -j "$BUILD/app.packaged.apk" classes.dex )

echo "==> Aligning"
"$ZIPALIGN" -f 4 "$BUILD/app.packaged.apk" "$BUILD/app.aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "==> Creating debug keystore"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass android -keypass android \
    -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi

echo "==> Signing"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$OUT/thinkora.apk" \
  "$BUILD/app.aligned.apk"

echo "==> Verifying"
"$APKSIGNER" verify --print-certs "$OUT/thinkora.apk" | head -4

echo
echo "DONE -> $OUT/thinkora.apk"
ls -lh "$OUT/thinkora.apk"
