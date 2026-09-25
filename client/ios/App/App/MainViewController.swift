import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // Capacitor disables bounce globally; re-enable vertical rubber-band
        // so the feed feels like a native iOS scroll view.
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
    }
}
