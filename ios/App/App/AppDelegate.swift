import UIKit
import WebKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import CoreLocation
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 🔔 إشعارات الآيفون عن طريق Firebase (FCM) — نفس طريق أندرويد على السيرفر (lib/fcm.ts).
        //    من غير GoogleService-Info.plist مانشغّلش Firebase (كان التطبيق هيقع) — الإشعارات بس اللي مش هتشتغل.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        return true
    }

    // 🔔 Apple بتدّي توكن APNs، والسيرفر بيبعت عن طريق Firebase ⇒ نحوّله لتوكن Firebase ونسلّمه لبلجن الإشعارات
    //    (طريقة Capacitor الرسمية) — PushRegistrar بيحفظه في device_tokens زي أندرويد بالظبط.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            // من غير Firebase مانبعتش توكن Apple الخام — السيرفر كان هيرفضه.
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                            object: NSError(domain: "qannas.push", code: 1, userInfo: [NSLocalizedDescriptionKey: "Firebase not configured"]))
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// MARK: - 🎙️ التسجيل في الخلفية (نسخة 1.4 — ٤ نوفمبر ٢٠٢٦)
//
// المالك: «عايز انزل ميزة ان الصوت يشتغل علي الايفون في فويس برو وفي التسجيل زي ما بيحصل علي الاندرويد».
//  · الميكروفون: إذن «audio» في Info.plist بيخلّي ميكروفون الصفحة يكمّل والتطبيق في الخلفية.
//  · الموقع: مكتبة الموقع بتقف في الخلفية ⇒ البلجن ده بيشغّل موقع الآيفون نفسه طول ما التسجيل شغّال ويبعته للصفحة
//    (lib/backgroundRecording.ts ⇒ gpsService.feedNativeFix) — كل لوحة بمكان نطقها.
//  · المكالمة ليها الأولوية: مكالمة قطعت الصوت ⇒ «call» ⇒ الصفحة تقفل الميك (زي الأندرويد).
// الكود هنا مش في ملف لوحده عن قصد: أي ملف Swift جديد لازم يتضاف لمشروع Xcode بإيد، والملف ده متضاف خلاص.

/// الشاشة الرئيسية (Main.storyboard) — نفس جسر Capacitor + تسجيل البلجن (طريقة Capacitor الرسمية «Custom Native iOS Code»).
class MainViewController: CAPBridgeViewController {
    let bgPlugin = PlateHunterBgPlugin()
    private var loadingObservation: NSKeyValueObservation?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(bgPlugin)
        // الصفحة اتعاد تحميلها (زي «تحديث البرنامج») ⇒ التسجيل اتقفل معاها ⇒ الموقع مايفضلش شغّال لوحده
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
            guard view.isLoading else { return }
            DispatchQueue.main.async { self?.bgPlugin.stopAll() }
        }
    }
}

/// «PlateHunterBackground» — الصفحة بتنده start لما التسجيل يبدأ و stop لما يقف (lib/backgroundRecording.ts).
@objc(PlateHunterBgPlugin)
public class PlateHunterBgPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "PlateHunterBgPlugin"
    public let jsName = "PlateHunterBackground"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var running = false
    private var location: CLLocationManager?
    private var capTimer: Timer?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)),
                                               name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = true
            self.startLocation()
            // أمان لو الصفحة ماقفلتش: أقصى ٦ ساعات (زي خدمة الأندرويد)
            self.capTimer?.invalidate()
            self.capTimer = Timer.scheduledTimer(withTimeInterval: 6 * 60 * 60, repeats: false) { [weak self] _ in
                self?.stopAll()
            }
            call.resolve(["ok": true, "location": self.location != nil])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.stopAll()
            call.resolve()
        }
    }

    func stopAll() {
        running = false
        capTimer?.invalidate()
        capTimer = nil
        if let m = location {
            m.stopUpdatingLocation()
            m.allowsBackgroundLocationUpdates = false
            m.delegate = nil
        }
        location = nil
    }

    /// موقع الآيفون نفسه — بس لو المندوب مدّي إذن الموقع، و«location» في Info.plist (من غيرها الآيفون بيقفل التطبيق).
    private func startLocation() {
        guard location == nil else { return }
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        guard modes.contains("location") else { return }
        let m = CLLocationManager()
        let status = m.authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }
        m.delegate = self
        m.desiredAccuracy = kCLLocationAccuracyBest
        m.distanceFilter = kCLDistanceFilterNone
        m.activityType = .otherNavigation
        m.pausesLocationUpdatesAutomatically = false
        m.allowsBackgroundLocationUpdates = true
        m.showsBackgroundLocationIndicator = true
        m.startUpdatingLocation()
        location = m
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running, let l = locations.last, l.horizontalAccuracy >= 0 else { return }
        notifyListeners("location", data: [
            "lat": l.coordinate.latitude,
            "lng": l.coordinate.longitude,
            "accuracy": l.horizontalAccuracy,
            "timestamp": l.timestamp.timeIntervalSince1970 * 1000
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // مؤقت (مفيش أقمار لحظتها) — الآيفون بيكمّل يحاول لوحده
    }

    /// 📞 مكالمة (تليفون/واتساب/فيس تايم) قطعت الصوت ⇒ الصفحة تقفل الميك. أسباب تانية (زي قفل ميك الآيباد) ⇒ ولا حاجة.
    @objc private func audioInterrupted(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        if let reason = info[AVAudioSessionInterruptionReasonKey] as? UInt,
           AVAudioSession.InterruptionReason(rawValue: reason) != .default { return }
        DispatchQueue.main.async {
            guard self.running else { return }
            self.notifyListeners("call", data: [:])
        }
    }
}
