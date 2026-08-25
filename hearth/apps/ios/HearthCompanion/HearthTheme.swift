import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class HearthTheme {
    let accent = Color(red: 0.12, green: 0.42, blue: 0.36)
    let warmAccent = Color(red: 0.78, green: 0.47, blue: 0.18)
    let success = Color(red: 0.12, green: 0.47, blue: 0.32)
    let card = Color(uiColor: .secondarySystemGroupedBackground)
    let background = Color(uiColor: .systemGroupedBackground)
}
