#!/usr/bin/env bash
# Construit dist/Revisator.apk sans Gradle ni SDK complet :
# aapt + dx (dalvik-exchange) + apksigner, avec android.jar (API 23).
# Sous Debian/Ubuntu : sudo apt-get install aapt dalvik-exchange apksigner zipalign android-sdk-platform-23 openjdk-17-jdk-headless
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
KEYSTORE=${KEYSTORE:-android/revisator.keystore}
KS_PASS=${KS_PASS:-revisator}
OUT=build
mkdir -p dist
rm -rf "$OUT" && mkdir -p "$OUT"/{gen,obj,assets}

echo "› Copie de l'application web"
cp -r www "$OUT/assets/www"

echo "› Ressources (R.java)"
aapt package -f -m -J "$OUT/gen" -M android/AndroidManifest.xml -S android/res -I "$ANDROID_JAR"

echo "› Compilation Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" \
  -d "$OUT/obj" $(find android/src "$OUT/gen" -name '*.java')

echo "› Conversion en bytecode Dalvik"
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/obj"

echo "› Empaquetage"
aapt package -f -M android/AndroidManifest.xml -S android/res -A "$OUT/assets" -I "$ANDROID_JAR" -F "$OUT/unsigned.apk"
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "› Création de la clé de signature"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias revisator \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Revisator, O=Revisator, C=FR"
fi

echo "› Signature"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias revisator --out dist/Revisator.apk "$OUT/aligned.apk"
apksigner verify dist/Revisator.apk
ls -lh dist/Revisator.apk
echo "✔ dist/Revisator.apk prêt"
