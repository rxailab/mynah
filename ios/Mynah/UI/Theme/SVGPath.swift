import CoreGraphics
import SwiftUI

/// Turns SVG path data into a `Path`.
///
/// The design's icons are kept as the path data it drew them with, exactly as
/// on Android — so this is the counterpart of Compose's `PathParser`, and both
/// apps draw from the same strings rather than from two sets of traced shapes.
enum SVGPath {

    static func parse(_ data: String) -> Path {
        var path = Path()
        var scanner = Scanner(data)
        var current = CGPoint.zero
        var start = CGPoint.zero
        /// The reflection point for a smooth curve, when the last command was one.
        var lastControl: CGPoint?
        var command: Character = " "

        while let next = scanner.command(after: command) {
            command = next
            let relative = command.isLowercase
            switch Character(command.lowercased()) {
            case "m":
                let point = scanner.point(relative ? current : .zero)
                path.move(to: point)
                current = point
                start = point
                lastControl = nil
                // Any further pairs after a moveto are an implicit lineto.
                while scanner.hasNumber {
                    let line = scanner.point(relative ? current : .zero)
                    path.addLine(to: line)
                    current = line
                }
            case "l":
                while scanner.hasNumber {
                    let point = scanner.point(relative ? current : .zero)
                    path.addLine(to: point)
                    current = point
                }
                lastControl = nil
            case "h":
                while scanner.hasNumber {
                    let x = scanner.number() + (relative ? current.x : 0)
                    current = CGPoint(x: x, y: current.y)
                    path.addLine(to: current)
                }
                lastControl = nil
            case "v":
                while scanner.hasNumber {
                    let y = scanner.number() + (relative ? current.y : 0)
                    current = CGPoint(x: current.x, y: y)
                    path.addLine(to: current)
                }
                lastControl = nil
            case "c":
                while scanner.hasNumber {
                    let origin = relative ? current : .zero
                    let c1 = scanner.point(origin)
                    let c2 = scanner.point(origin)
                    let end = scanner.point(origin)
                    path.addCurve(to: end, control1: c1, control2: c2)
                    current = end
                    lastControl = c2
                }
            case "s":
                while scanner.hasNumber {
                    let origin = relative ? current : .zero
                    let c1 = lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                    let c2 = scanner.point(origin)
                    let end = scanner.point(origin)
                    path.addCurve(to: end, control1: c1, control2: c2)
                    current = end
                    lastControl = c2
                }
            case "q":
                while scanner.hasNumber {
                    let origin = relative ? current : .zero
                    let control = scanner.point(origin)
                    let end = scanner.point(origin)
                    path.addQuadCurve(to: end, control: control)
                    current = end
                    lastControl = control
                }
            case "t":
                while scanner.hasNumber {
                    let origin = relative ? current : .zero
                    let control = lastControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                    let end = scanner.point(origin)
                    path.addQuadCurve(to: end, control: control)
                    current = end
                    lastControl = control
                }
            case "a":
                while scanner.hasNumber {
                    let rx = scanner.number()
                    let ry = scanner.number()
                    let rotation = scanner.number()
                    let largeArc = scanner.flag()
                    let sweep = scanner.flag()
                    var end = scanner.point(.zero)
                    if relative { end = CGPoint(x: current.x + end.x, y: current.y + end.y) }
                    addArc(&path, from: current, to: end, rx: rx, ry: ry,
                           rotation: rotation, largeArc: largeArc, sweep: sweep)
                    current = end
                    lastControl = nil
                }
            case "z":
                path.closeSubpath()
                current = start
                lastControl = nil
                // Nothing may repeat a close, so a stray number after one ends
                // the parse rather than closing the same subpath for ever.
                command = " "
            default:
                // Unknown letter: skip whatever numbers follow it rather than
                // spinning on the same character.
                while scanner.hasNumber { _ = scanner.number() }
            }
        }
        return path
    }

    /// An elliptical arc, as the cubics `Path` can draw. Endpoint to centre
    /// parameterisation, straight out of the SVG specification's appendix.
    private static func addArc(
        _ path: inout Path,
        from: CGPoint,
        to: CGPoint,
        rx: CGFloat,
        ry: CGFloat,
        rotation: CGFloat,
        largeArc: Bool,
        sweep: Bool
    ) {
        if from == to { return }
        var rx = abs(rx), ry = abs(ry)
        if rx == 0 || ry == 0 {
            path.addLine(to: to)
            return
        }

        let phi = rotation * .pi / 180
        let dx2 = (from.x - to.x) / 2, dy2 = (from.y - to.y) / 2
        let x1 = cos(phi) * dx2 + sin(phi) * dy2
        let y1 = -sin(phi) * dx2 + cos(phi) * dy2

        // Radii too small to reach: scale them up, as the specification requires.
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 {
            rx *= sqrt(lambda)
            ry *= sqrt(lambda)
        }

        let sign: CGFloat = largeArc == sweep ? -1 : 1
        let numerator = max(0, rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1)
        let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
        let coefficient = sign * sqrt(denominator == 0 ? 0 : numerator / denominator)
        let cx1 = coefficient * rx * y1 / ry
        let cy1 = -coefficient * ry * x1 / rx

        let cx = cos(phi) * cx1 - sin(phi) * cy1 + (from.x + to.x) / 2
        let cy = sin(phi) * cx1 + cos(phi) * cy1 + (from.y + to.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            let value = acos(min(1, max(-1, len == 0 ? 1 : dot / len)))
            return (ux * vy - uy * vx) < 0 ? -value : value
        }

        let startAngle = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
        var delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
        if !sweep, delta > 0 { delta -= 2 * .pi }
        if sweep, delta < 0 { delta += 2 * .pi }

        // Split into quarter turns or smaller: a cubic can only carry so much
        // arc before it stops being the arc.
        let segments = Int(ceil(abs(delta) / (.pi / 2)))
        let step = delta / CGFloat(max(1, segments))
        let alpha = 4.0 / 3.0 * tan(step / 4)

        var theta = startAngle
        for _ in 0..<max(1, segments) {
            let cosA = cos(theta), sinA = sin(theta)
            let cosB = cos(theta + step), sinB = sin(theta + step)

            func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
                CGPoint(
                    x: cos(phi) * rx * x - sin(phi) * ry * y + cx,
                    y: sin(phi) * rx * x + cos(phi) * ry * y + cy
                )
            }

            let end = map(cosB, sinB)
            let c1 = map(cosA - alpha * sinA, sinA + alpha * cosA)
            let c2 = map(cosB + alpha * sinB, sinB - alpha * cosB)
            path.addCurve(to: end, control1: c1, control2: c2)
            theta += step
        }
    }

    /// A hand-rolled tokeniser: SVG allows numbers to run together with no
    /// separator at all ("m11 18-6-6"), which no general-purpose scanner does.
    private struct Scanner {
        private let characters: [Character]
        private var index = 0

        init(_ text: String) { characters = Array(text) }

        private mutating func skipSeparators() {
            while index < characters.count, characters[index] == " " || characters[index] == ","
                || characters[index] == "\n" || characters[index] == "\t" || characters[index] == "\r" {
                index += 1
            }
        }

        var hasNumber: Bool {
            var probe = self
            probe.skipSeparators()
            guard probe.index < probe.characters.count else { return false }
            let c = probe.characters[probe.index]
            return c.isNumber || c == "-" || c == "+" || c == "."
        }

        /// The next command letter, or the previous one repeated when the data
        /// leaves it out — "M0,0 1,1" means a moveto followed by a lineto, and
        /// "L1,1 2,2" repeats the lineto.
        mutating func command(after previous: Character) -> Character? {
            skipSeparators()
            guard index < characters.count else { return nil }
            let c = characters[index]
            if c.isLetter {
                index += 1
                return c
            }
            guard previous != " " else { return nil }
            // A repeated moveto continues as a lineto, which the "m" and "l"
            // cases above already handle by consuming every pair they find.
            return previous
        }

        mutating func number() -> CGFloat {
            skipSeparators()
            var text = ""
            if index < characters.count, characters[index] == "-" || characters[index] == "+" {
                text.append(characters[index])
                index += 1
            }
            var seenDot = false
            while index < characters.count {
                let c = characters[index]
                if c.isNumber {
                    text.append(c)
                } else if c == ".", !seenDot {
                    seenDot = true
                    text.append(c)
                } else if c == "e" || c == "E" {
                    text.append(c)
                    index += 1
                    if index < characters.count, characters[index] == "-" || characters[index] == "+" {
                        text.append(characters[index])
                        index += 1
                    }
                    continue
                } else {
                    break
                }
                index += 1
            }
            return CGFloat(Double(text) ?? 0)
        }

        /// An arc's large-arc and sweep flags are single digits, and may be
        /// written with no separator at all ("1 0 013 0").
        mutating func flag() -> Bool {
            skipSeparators()
            guard index < characters.count else { return false }
            let c = characters[index]
            if c == "0" || c == "1" {
                index += 1
                return c == "1"
            }
            return number() != 0
        }

        mutating func point(_ origin: CGPoint) -> CGPoint {
            let x = number(), y = number()
            return CGPoint(x: origin.x + x, y: origin.y + y)
        }
    }
}

/// One path from the design's 24-unit grid, scaled into whatever it is given.
struct SVGShape: Shape {
    let data: String
    var grid: CGFloat = 24

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / grid
        return SVGPath.parse(data).applying(CGAffineTransform(scaleX: scale, y: scale))
    }
}
