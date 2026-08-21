import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        // The web extension does not use native messaging or pass page data to the host app.
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
