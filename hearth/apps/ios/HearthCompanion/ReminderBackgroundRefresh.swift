@preconcurrency import BackgroundTasks
import Foundation
import OSLog
import UIKit

@MainActor
final class HearthAppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        ReminderBackgroundRefreshCoordinator.shared.register()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        ReminderBackgroundRefreshCoordinator.shared.scheduleNextRefresh()
    }
}

@MainActor
final class ReminderBackgroundRefreshCoordinator {
    static let shared = ReminderBackgroundRefreshCoordinator()
    static let taskIdentifier = "app.hearth.companion.reminders.refresh"
    static let earliestRefreshDelay: TimeInterval = 15 * 60

    private let logger = Logger(subsystem: "app.hearth.companion", category: "ReminderRefresh")
    private weak var bridgeModel: ReminderBridgeViewModel?
    private weak var activeSystemTask: BGAppRefreshTask?
    private var activeOperation: Task<Void, Never>?
    private var isRegistered = false

    private init() {}

    func configure(bridgeModel: ReminderBridgeViewModel) {
        self.bridgeModel = bridgeModel
    }

    func register() {
        guard !isRegistered else { return }
        isRegistered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.taskIdentifier,
            using: nil
        ) { task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor in
                ReminderBackgroundRefreshCoordinator.shared.handle(refreshTask)
            }
        }
        if !isRegistered {
            logger.error("The reminder background refresh task could not be registered.")
        }
    }

    func scheduleNextRefresh() {
        guard isRegistered, bridgeModel?.hasPairedSource == true else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: Self.earliestRefreshDelay)
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("A best-effort reminder background refresh was scheduled.")
        } catch {
            logger.error("The reminder background refresh could not be scheduled: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func handle(_ systemTask: BGAppRefreshTask) {
        scheduleNextRefresh()
        guard let bridgeModel else {
            systemTask.setTaskCompleted(success: true)
            return
        }

        activeOperation?.cancel()
        activeSystemTask?.setTaskCompleted(success: false)
        activeSystemTask = systemTask

        let operation = Task { @MainActor [weak self, weak systemTask] in
            guard let self, let systemTask else { return }
            let succeeded = await bridgeModel.performBackgroundRefresh()
            finish(systemTask, success: succeeded && !Task.isCancelled)
        }
        activeOperation = operation
        systemTask.expirationHandler = { [weak self, weak systemTask] in
            Task { @MainActor in
                guard let self, let systemTask else { return }
                self.activeOperation?.cancel()
                bridgeModel.cancelBackgroundRefresh()
                self.finish(systemTask, success: false)
            }
        }
    }

    private func finish(_ systemTask: BGAppRefreshTask, success: Bool) {
        guard activeSystemTask === systemTask else { return }
        systemTask.expirationHandler = nil
        activeOperation = nil
        activeSystemTask = nil
        systemTask.setTaskCompleted(success: success)
        logger.info("Reminder background refresh finished with success=\(success, privacy: .public).")
    }
}
