#!/bin/bash
# 🍏 بناء نسخة الآيفون للرفع على App Store — على الماك، من أي مكان:
#     bash ~/platehunter-ksa/scripts/ios-release.sh
# بيعمل كل الخطوات ورا بعض، ولو حاجة ناقصة بيقف برسالة واضحة بدل ما يطلّع نسخة من غير إشعارات.
set -e
cd "$(dirname "$0")/.."

echo "⬇️  آخر نسخة من الكود..."
git pull
npm install

# 🔔 ملف Firebase بتاع الآيفون (مش على GitHub — زي google-services.json بتاع أندرويد)
if [ ! -f ios/App/App/GoogleService-Info.plist ]; then
  if [ -f ~/Downloads/GoogleService-Info.plist ]; then
    cp ~/Downloads/GoogleService-Info.plist ios/App/App/
    echo "✅ نقلت GoogleService-Info.plist من التنزيلات"
  else
    echo "❌ GoogleService-Info.plist مش موجود — نزّله من Firebase وحطّه في التنزيلات (Downloads) وشغّل تاني."
    exit 1
  fi
fi

# Capacitor محتاج مجلد الويب موجود حتى لو التطبيق بيفتح من Vercel
mkdir -p out
[ -f out/index.html ] || printf '<!doctype html><title>app</title>' > out/index.html
npx cap copy ios

# الإشعار والتطبيق مفتوح + بلجن الإشعارات متسجّل — من غيرهم الإشعارات مش هتشتغل
grep -q '"presentationOptions"' ios/App/App/capacitor.config.json || { echo "❌ إعداد الإشعارات مانزلش في capacitor.config.json"; exit 1; }
grep -q '"PushNotificationsPlugin"' ios/App/App/capacitor.config.json || { echo "❌ بلجن الإشعارات مش متسجّل في capacitor.config.json"; exit 1; }

ARCHIVE=~/Desktop/PlateHunter-$(date +%Y%m%d-%H%M).xcarchive
echo "🔨 بنبني الأرشيف (أول مرة بتاخد كام دقيقة عشان بتنزّل Firebase)..."
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive -allowProvisioningUpdates

echo "✅ الأرشيف جاهز: $ARCHIVE"
echo "   هيفتح دلوقتي في Xcode ← Distribute App ← App Store Connect ← Upload"
open "$ARCHIVE"
