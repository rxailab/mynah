package com.voicecall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.voicecall.R
import com.voicecall.data.Call
import com.voicecall.data.CallStatus
import com.voicecall.ui.CallsViewModel
import com.voicecall.ui.FeedRow
import com.voicecall.ui.GroupLabel
import com.voicecall.ui.GroupedCard
import com.voicecall.ui.IconCircle
import com.voicecall.ui.OutlineChip
import com.voicecall.ui.costLabel
import com.voicecall.ui.formatClock
import com.voicecall.ui.navBarPadding
import com.voicecall.ui.statusBarPadding
import com.voicecall.ui.theme.Ink
import com.voicecall.ui.theme.Type
import com.voicecall.ui.theme.Wise

/**
 * Search across everything the assistant has done.
 *
 * Entirely local: the call list is already on the device, and it is small enough
 * that filtering it here is both instant and one fewer endpoint to get wrong.
 * What is searched is what a person would remember — who was called, what was
 * asked for, and what came back — rather than the full transcript, which would
 * match half the list on any common word.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(
    vm: CallsViewModel,
    onBack: () -> Unit,
    onOpenCall: (String) -> Unit,
    onOpenDetail: (String) -> Unit,
) {
    val state by vm.uiState.collectAsState()
    val recents by vm.recentSearches.collectAsState()
    val context = LocalContext.current
    var query by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        vm.refresh(quiet = true)
        focus.requestFocus()
    }

    val needle = query.trim()
    val results = if (needle.isBlank()) emptyList() else state.calls.filter { it.matches(needle) }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .padding(top = statusBarPadding(), bottom = navBarPadding()),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = 12.dp, end = 20.dp, top = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconCircle(Wise.ArrowLeft, stringResource(R.string.action_back), onBack)
            Spacer(Modifier.width(6.dp))
            Row(
                Modifier
                    .weight(1f)
                    .background(Ink.Card, RoundedCornerShape(12.dp))
                    .border(1.dp, Ink.Outline, RoundedCornerShape(12.dp))
                    .padding(horizontal = 13.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Wise.Search, null, tint = Ink.Mute, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(9.dp))
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) {
                        Text(stringResource(R.string.search_hint), style = Type.Sub, color = Ink.Mute)
                    }
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        textStyle = Type.Sub.copy(color = Ink.Text),
                        cursorBrush = SolidColor(Ink.Text),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { vm.rememberSearch(needle) }),
                        modifier = Modifier.fillMaxWidth().focusRequester(focus),
                    )
                }
            }
        }

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 24.dp),
        ) {
            if (needle.isNotBlank()) {
                GroupLabel(
                    stringResource(R.string.search_results, results.size),
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                if (results.isEmpty()) {
                    Text(stringResource(R.string.search_none), style = Type.Caption, color = Ink.Mute)
                } else {
                    GroupedCard(rows = results.map { call ->
                        {
                            FeedRow(
                                dot = if (call.isLive) Ink.Lime else if (call.status == CallStatus.FAILED) Ink.Negative else Ink.Positive,
                                title = call.summary?.ifBlank { null } ?: call.goal,
                                subtitle = call.businessName,
                                pulsing = call.isLive,
                                onClick = { if (call.isLive) onOpenCall(call.id) else onOpenDetail(call.id) },
                                right = {
                                    Text(
                                        formatClock(call.endedAt ?: call.createdAt),
                                        style = Type.Mono,
                                        color = Ink.Mute,
                                    )
                                    call.cost?.let { Text(costLabel(it), style = Type.Mono, color = Ink.Mute) }
                                },
                            )
                        }
                    })
                }
                Spacer(Modifier.height(20.dp))
            }

            if (recents.isNotEmpty()) {
                GroupLabel(
                    stringResource(R.string.search_recent),
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    recents.forEach { term -> OutlineChip(term) { query = term } }
                }
            }
        }
    }
}

/**
 * The fields worth matching on. Deliberately not the transcript: searching every
 * spoken word turns "the" into a hit on everything, and the useful memory of a
 * call is who it was to and how it came out.
 */
private fun Call.matches(needle: String): Boolean {
    val q = needle.lowercase()
    return businessName.lowercase().contains(q) ||
        goal.lowercase().contains(q) ||
        phoneNumber.contains(q) ||
        summary.orEmpty().lowercase().contains(q) ||
        results.values.any { it.lowercase().contains(q) }
}
