// Rasteriza um SVG num PNG de alta resolução, usando o WKWebView do próprio macOS.
// Uso: swiftc -O rasterizar.swift -o rasterizar && ./rasterizar entrada.svg saida.png <largura> <altura>
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 5 else {
    fputs("uso: rasterizar <svg> <png> <largura> <altura>\n", stderr); exit(2)
}
let entrada = URL(fileURLWithPath: args[1])
let saida = URL(fileURLWithPath: args[2])
let largura = Double(args[3]) ?? 2460
let altura = Double(args[4]) ?? 1880

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

final class Dono: NSObject, WKNavigationDelegate {
    let web: WKWebView
    let saida: URL
    let largura: Double
    let altura: Double
    init(saida: URL, largura: Double, altura: Double) {
        self.saida = saida; self.largura = largura; self.altura = altura
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: largura, height: altura),
                        configuration: WKWebViewConfiguration())
        super.init()
        web.navigationDelegate = self
    }
    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) {
        // Espera a fonte embutida carregar antes de fotografar.
        w.evaluateJavaScript("document.fonts.ready.then(() => 1)") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                let cfg = WKSnapshotConfiguration()
                cfg.rect = NSRect(x: 0, y: 0, width: self.largura, height: self.altura)
                cfg.snapshotWidth = NSNumber(value: self.largura * 2)   // 2x: texto nítido
                w.takeSnapshot(with: cfg) { img, err in
                    guard let img = img, let tiff = img.tiffRepresentation,
                          let bmp = NSBitmapImageRep(data: tiff),
                          let png = bmp.representation(using: .png, properties: [:]) else {
                        fputs("falhou o snapshot: \(String(describing: err))\n", stderr); exit(1)
                    }
                    try? png.write(to: self.saida)
                    print("png \(bmp.pixelsWide)x\(bmp.pixelsHigh)")
                    exit(0)
                }
            }
        }
    }
}

let dono = Dono(saida: saida, largura: largura, altura: altura)
let html = """
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fbfbf9}svg{display:block;width:\(Int(largura))px;height:auto}</style>
</head><body>\(try! String(contentsOf: entrada, encoding: .utf8))</body></html>
"""
dono.web.loadHTMLString(html, baseURL: entrada.deletingLastPathComponent())
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { fputs("tempo esgotado\n", stderr); exit(1) }
app.run()
