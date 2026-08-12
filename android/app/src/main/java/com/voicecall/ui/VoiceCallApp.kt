package com.voicecall.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.LocalActivityResultRegistryOwner
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.voicecall.R
import com.voicecall.data.localisedFor
import com.voicecall.ui.screens.CallScreen
import com.voicecall.ui.screens.ConfirmScreen
import com.voicecall.ui.screens.DetailScreen
import com.voicecall.ui.screens.ChangePasswordScreen
import com.voicecall.ui.screens.EmailSignInScreen
import com.voicecall.ui.screens.FeedbackScreen
import com.voicecall.ui.screens.ShareCardScreen
import com.voicecall.ui.screens.NewPasswordScreen
import com.voicecall.ui.screens.ResetCodeScreen
import com.voicecall.ui.screens.ScheduleTimeScreen
import com.voicecall.ui.screens.HistoryScreen
import com.voicecall.ui.screens.HomeScreen
import com.voicecall.ui.screens.ComposeScreen
import com.voicecall.ui.screens.NotificationsScreen
import com.voicecall.ui.screens.ProfileSetupScreen
import com.voicecall.ui.screens.BusinessesScreen
import com.voicecall.ui.screens.HelpScreen
import com.voicecall.ui.screens.ScheduledScreen
import com.voicecall.ui.screens.SearchScreen
import com.voicecall.ui.screens.TemplatesScreen
import com.voicecall.ui.screens.UsageScreen
import com.voicecall.ui.screens.VerifyNumberScreen
import com.voicecall.ui.screens.WhoForScreen
import com.voicecall.ui.screens.SettingsScreen
import com.voicecall.ui.screens.SignInScreen
import com.voicecall.ui.screens.WelcomeScreen
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

private object Routes {
    const val WELCOME = "welcome"
    const val SIGN_IN = "sign-in"
    const val PROFILE = "profile-setup"
    const val VERIFY_NUMBER = "verify-number"
    const val COMPOSE = "compose"
    const val SEARCH = "search"
    const val NOTIFICATIONS = "notifications"
    const val TEMPLATES = "templates"
    const val BUSINESSES = "businesses"
    const val USAGE = "usage"
    const val HELP = "help"
    const val SCHEDULED = "scheduled"
    const val WHO_FOR = "who-for"
    const val EMAIL = "sign-in/email"
    const val RESET_CODE = "sign-in/reset-code"
    const val RESET_NEW = "sign-in/reset-password"
    const val CHANGE_PASSWORD = "change-password"
    const val SCHEDULE_TIME = "schedule-time"
    const val HOME = "home"
    const val HISTORY = "history"
    const val SETTINGS = "settings"
    const val CONFIRM = "confirm"
    const val CALL = "call/{id}"
    const val DETAIL = "detail/{id}"
    const val SHARE = "share/{id}"
    const val FEEDBACK = "feedback/{id}"
    fun call(id: String) = "call/$id"
    fun detail(id: String) = "detail/$id"
    fun share(id: String) = "share/$id"
    fun feedback(id: String) = "feedback/$id"
}

@Composable
fun VoiceCallApp(initialCallId: String? = null, vm: CallsViewModel = viewModel()) {
    val language by vm.language.collectAsState()

    val base = LocalContext.current
    val localised = remember(language, base) { base.localisedFor(language) }

    // Overriding LocalContext with a non-Activity wrapper hides the activity's
    // ActivityResultRegistry, and every rememberLauncherForActivityResult below
    // (mic permission, contact picker) crashes without it — so pass it through.
    val registryOwner = LocalActivityResultRegistryOwner.current
    val locals = buildList {
        add(LocalContext provides localised)
        add(LocalConfiguration provides localised.resources.configuration)
        registryOwner?.let { add(LocalActivityResultRegistryOwner provides it) }
    }.toTypedArray()

    CompositionLocalProvider(*locals) {
        AppContent(vm, initialCallId)
    }
}

@Composable
private fun AppContent(vm: CallsViewModel, initialCallId: String? = null) {
    val settings by vm.settings.collectAsState()
    val firstRun by vm.firstRun.collectAsState()

    // Wait for both before choosing a start destination — NavHost fixes it on
    // first composition, so guessing here would flash the wrong screen at
    // exactly the person least equipped to ignore it.
    val loaded = settings
    val seen = firstRun
    if (loaded == null || seen == null) {
        AppBackdrop {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ink.Text, strokeWidth = 2.5.dp)
            }
        }
        return
    }

    val nav = rememberNavController()

    // Introduce, then sign in, then the one question the assistant cannot work
    // without. Remembered rather than recomputed — NavHost reads it once, and
    // the effect below wants something stable to compare against.
    val start = remember {
        when {
            !seen.welcomeSeen -> Routes.WELCOME
            !loaded.isSignedIn -> Routes.SIGN_IN
            !seen.profilePrompted -> Routes.PROFILE
            else -> Routes.HOME
        }
    }

    // Crossing the gate in either direction moves the whole stack. Signing in
    // is obvious; signing out is not always a button — a session expires, or is
    // ended elsewhere, and whatever is on screen then is showing somebody's
    // calls that the app can no longer prove belong to them.
    val signedIn = loaded.isSignedIn
    var wasSignedIn by remember { mutableStateOf(signedIn) }
    LaunchedEffect(signedIn) {
        if (signedIn) vm.loadAccount()
        // First pass is not a crossing: NavHost already started in the right place.
        if (signedIn == wasSignedIn) return@LaunchedEffect
        wasSignedIn = signedIn
        val next = when {
            !signedIn -> Routes.SIGN_IN
            // Someone who has just signed up has not been asked yet; someone
            // signing back in has, and goes straight to the app.
            !vm.firstRun.value!!.profilePrompted -> Routes.PROFILE
            else -> Routes.HOME
        }
        nav.navigate(next) { popUpTo(0) }
    }

    // A notification tap goes straight to the call it was about.
    LaunchedEffect(initialCallId) {
        if (!initialCallId.isNullOrBlank() && loaded.isSignedIn) {
            nav.navigate(Routes.detail(initialCallId))
        }
    }

    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    var coachTargets by remember { mutableStateOf(CoachTargets()) }

    // Asked on arrival at Home, not at launch. Notifications here are about
    // calls in progress, and there is nothing to say about a call to somebody
    // who has not yet seen what the app does — a permission dialog over the
    // welcome slide is a question without a reason attached.
    val askNotifications = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    val context = LocalContext.current
    // The tour now runs on the composer, not here, so arriving at the feed is
    // no longer a moment that could collide with a coach mark mid-sentence.
    val atHome = route == Routes.HOME
    LaunchedEffect(atHome) {
        if (atHome && Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    // No bottom navigation in this design. Home is the only root: search,
    // notifications and settings are top-bar icons on it, and everything else is
    // pushed over it from a row.

    AppBackdrop {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                NavHost(navController = nav, startDestination = start) {
                    composable(Routes.WELCOME) {
                        WelcomeScreen(onDone = {
                            vm.finishWelcome()
                            nav.navigate(Routes.SIGN_IN) { popUpTo(0) }
                        })
                    }
                    composable(Routes.SIGN_IN) {
                        SignInScreen(vm = vm, onUseEmail = { nav.navigate(Routes.EMAIL) })
                    }
                    composable(Routes.EMAIL) {
                        EmailSignInScreen(
                            vm = vm,
                            onBack = { nav.popBackStack(); vm.clearSignInError() },
                            onForgot = { nav.navigate(Routes.RESET_CODE) },
                        )
                    }
                    composable(Routes.RESET_CODE) {
                        ResetCodeScreen(
                            vm = vm,
                            onBack = { nav.popBackStack(); vm.clearReset() },
                            onEntered = { nav.navigate(Routes.RESET_NEW) },
                        )
                    }
                    composable(Routes.RESET_NEW) {
                        NewPasswordScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            // Already signed in by the time this fires, so the
                            // whole sign-in stack goes rather than being left
                            // behind the back button.
                            onDone = { nav.navigate(Routes.HOME) { popUpTo(0) } },
                        )
                    }
                    composable(Routes.CHANGE_PASSWORD) {
                        ChangePasswordScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            // Signed in but unable to remember the current one.
                            // The emailed code proves the address just as well,
                            // and it is the account's own address either way.
                            onForgot = {
                                vm.account.value?.email?.let { address ->
                                    vm.sendResetCode(address) { nav.navigate(Routes.RESET_CODE) }
                                }
                            },
                        )
                    }
                    composable(Routes.PROFILE) {
                        ProfileSetupScreen(vm = vm, onDone = { savedNumber ->
                            vm.finishProfilePrompt()
                            // Nothing to verify for someone who skipped the
                            // number; that step is offered again in Settings.
                            val next = if (savedNumber) Routes.VERIFY_NUMBER else Routes.HOME
                            nav.navigate(next) { popUpTo(0) }
                        })
                    }
                    // Offered once the number is known, since it is that number
                    // being verified. Skipping only defers it: no call can be
                    // placed until this is done.
                    composable(Routes.VERIFY_NUMBER) {
                        VerifyNumberScreen(vm = vm, onDone = {
                            // Opened from Settings there is a screen to go back
                            // to; reached from sign-up the stack was cleared, so
                            // popping fails and Home is the way on.
                            if (!nav.popBackStack()) nav.navigate(Routes.HOME) { popUpTo(0) }
                        })
                    }

                    composable(Routes.HOME) {
                        HomeScreen(
                            vm,
                            onOpenCall = { id -> nav.navigate(Routes.call(id)) },
                            onOpenDetail = { id -> nav.navigate(Routes.detail(id)) },
                            onCompose = { nav.navigate(Routes.COMPOSE) },
                            onSearch = { nav.navigate(Routes.SEARCH) },
                            onNotifications = { nav.navigate(Routes.NOTIFICATIONS) },
                            onSettings = { nav.navigate(Routes.SETTINGS) },
                            onHistory = { nav.navigate(Routes.HISTORY) },
                        )
                    }
                    composable(Routes.COMPOSE) {
                        ComposeScreen(
                            vm = vm,
                            onBack = { nav.popBackStack(); vm.clearParse() },
                            onParsed = { nav.navigate(Routes.CONFIRM) },
                            onVerifyNumber = { nav.navigate(Routes.VERIFY_NUMBER) },
                            onCoachTargets = { coachTargets = it },
                        )
                    }
                    composable(Routes.TEMPLATES) {
                        TemplatesScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            // Replace this screen rather than stack on it: going
                            // back from the composer belongs at the feed, not at
                            // the list you picked from.
                            onCompose = {
                                nav.navigate(Routes.COMPOSE) {
                                    popUpTo(Routes.TEMPLATES) { inclusive = true }
                                }
                            },
                        )
                    }
                    composable(Routes.BUSINESSES) {
                        BusinessesScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            onCompose = {
                                nav.navigate(Routes.COMPOSE) {
                                    popUpTo(Routes.BUSINESSES) { inclusive = true }
                                }
                            },
                        )
                    }
                    composable(Routes.USAGE) {
                        UsageScreen(vm = vm, onBack = { nav.popBackStack() })
                    }
                    composable(Routes.WHO_FOR) {
                        WhoForScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            onVerifyNumber = { nav.navigate(Routes.VERIFY_NUMBER) },
                        )
                    }
                    composable(Routes.SCHEDULED) {
                        ScheduledScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            onCompose = { nav.navigate(Routes.COMPOSE) },
                            // "Check and call" is the ordinary path, not a
                            // shortcut past it: the task's brief goes into the
                            // composer and the check step happens as always.
                            onConfirm = { task ->
                                vm.seedComposer(task.goal)
                                vm.dismissScheduled(task.id)
                                nav.navigate(Routes.COMPOSE)
                            },
                        )
                    }
                    composable(Routes.HELP) {
                        HelpScreen(onBack = { nav.popBackStack() }, onContact = { openSupportEmail(context) })
                    }
                    composable(Routes.SEARCH) {
                        SearchScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            onOpenCall = { id -> nav.navigate(Routes.call(id)) },
                            onOpenDetail = { id -> nav.navigate(Routes.detail(id)) },
                        )
                    }
                    composable(Routes.NOTIFICATIONS) {
                        NotificationsScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            onOpenCall = { id -> nav.navigate(Routes.call(id)) },
                            onOpenDetail = { id -> nav.navigate(Routes.detail(id)) },
                        )
                    }
                    composable(Routes.HISTORY) {
                        HistoryScreen(
                            vm,
                            onBack = { nav.popBackStack() },
                            onSearch = { nav.navigate(Routes.SEARCH) },
                            onOpen = { id, live ->
                                nav.navigate(if (live) Routes.call(id) else Routes.detail(id))
                            },
                        )
                    }
                    composable(Routes.SETTINGS) {
                        SettingsScreen(
                            vm,
                            onVerifyNumber = { nav.navigate(Routes.VERIFY_NUMBER) },
                            onTemplates = { nav.navigate(Routes.TEMPLATES) },
                            onBusinesses = { nav.navigate(Routes.BUSINESSES) },
                            onUsage = { nav.navigate(Routes.USAGE) },
                            onHelp = { nav.navigate(Routes.HELP) },
                            onScheduled = { nav.navigate(Routes.SCHEDULED) },
                            onWhoFor = { nav.navigate(Routes.WHO_FOR) },
                            onChangePassword = { nav.navigate(Routes.CHANGE_PASSWORD) },
                        )
                    }

                    composable(Routes.CONFIRM) {
                        ConfirmScreen(
                            vm = vm,
                            // Pop first, then drop the brief: clearing it while
                            // this screen is still composed makes it ask to go
                            // back a second time and takes Home with it.
                            onBack = { nav.popBackStack(); vm.clearParse() },
                            onPlaced = { id ->
                                nav.popBackStack(Routes.HOME, inclusive = false)
                                nav.navigate(Routes.call(id))
                            },
                            // Out of calls. The brief is left exactly as it is,
                            // so topping up and coming back dials what they
                            // already wrote rather than making them write it
                            // again.
                            onNeedsTopUp = { nav.navigate(Routes.USAGE) },
                            onCallLater = { nav.navigate(Routes.SCHEDULE_TIME) },
                        )
                    }
                    composable(Routes.SCHEDULE_TIME) {
                        ScheduleTimeScreen(
                            vm = vm,
                            onBack = { nav.popBackStack() },
                            // Straight to the list it was just added to, with
                            // the composer and check steps left behind.
                            onScheduled = {
                                nav.popBackStack(Routes.HOME, inclusive = false)
                                nav.navigate(Routes.SCHEDULED)
                            },
                        )
                    }
                    composable(Routes.CALL) { e ->
                        CallScreen(
                            vm = vm,
                            callId = e.arguments?.getString("id").orEmpty(),
                            onFinished = { id ->
                                nav.popBackStack(Routes.HOME, inclusive = false)
                                nav.navigate(Routes.detail(id))
                            },
                            onClose = { if (!nav.popBackStack()) nav.navigate(Routes.HOME) },
                        )
                    }
                    composable(Routes.DETAIL) { e ->
                        DetailScreen(
                            vm = vm,
                            callId = e.arguments?.getString("id").orEmpty(),
                            onBack = { if (!nav.popBackStack()) nav.navigate(Routes.HISTORY) },
                            onRedialled = { id -> nav.navigate(Routes.call(id)) },
                            onShare = {
                                nav.navigate(Routes.share(e.arguments?.getString("id").orEmpty()))
                            },
                            onFeedback = {
                                nav.navigate(Routes.feedback(e.arguments?.getString("id").orEmpty()))
                            },
                        )
                    }
                    composable(Routes.SHARE) { e ->
                        ShareCardScreen(
                            vm = vm,
                            callId = e.arguments?.getString("id").orEmpty(),
                            onBack = { nav.popBackStack() },
                        )
                    }
                    composable(Routes.FEEDBACK) { e ->
                        FeedbackScreen(
                            vm = vm,
                            callId = e.arguments?.getString("id").orEmpty(),
                            onBack = { nav.popBackStack() },
                            onSent = { nav.popBackStack() },
                        )
                    }
                }
            }

        }

        // Outside the column on purpose: the scrim covers the navigation bar
        // too, and the last coach mark points at the button just above it.
        // The tour explains the composer, so it runs the first time the composer
        // is opened rather than on first sight of the feed.
        if (route == Routes.COMPOSE && !seen.coachSeen) {
            HomeCoach(targets = coachTargets, onFinished = vm::finishCoach)
        }
    }
}

/**
 * Hands the support address to whatever the phone uses for email. Silently does
 * nothing when there is no mail app — a crash is a worse answer to "contact us"
 * than no answer.
 */
private fun openSupportEmail(context: android.content.Context) {
    val intent = android.content.Intent(android.content.Intent.ACTION_SENDTO).apply {
        data = android.net.Uri.parse("mailto:" + context.getString(R.string.support_email))
    }
    runCatching { context.startActivity(intent) }
}

/**
 * Bottom inset for a screen that pins something to its foot. Without it the
 * action ends up under the system navigation bar, which is easy to miss on a
 * device with gesture navigation and impossible to tap on one without.
 */
@Composable
fun navBarPadding(): androidx.compose.ui.unit.Dp =
    WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

/** Top inset for a screen that draws its own header under the status bar. */
@Composable
fun statusBarPadding(): androidx.compose.ui.unit.Dp =
    WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
