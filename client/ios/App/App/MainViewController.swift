import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        // Capacitor disables bounce globally; re-enable vertical rubber-band
        // so the feed feels like a native iOS scroll view.
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
        // Overscroll used to reveal a black strip under every page. Match the
        // paper background so the bounce blends into the app.
        let paper = UIColor(red: 240 / 255, green: 233 / 255, blue: 223 / 255, alpha: 1)
        view.backgroundColor = paper
        webView?.backgroundColor = paper
        webView?.scrollView.backgroundColor = paper
        webView?.isOpaque = true
    }
}
