/**
 * lucet-react
 *
 * React bindings for Lucet. Presentation and hooks only. All state logic lives
 * in the `lucet` core so other framework wrappers stay small.
 *
 * Styles are a separate import, so a host can take the behaviour without the
 * look:  import 'lucet-react/styles.css'
 */

export { LucetProvider, useLucet } from './context.js'
export type { LucetProviderProps } from './context.js'
export { useThread, useEventLog, useTriggerGroups } from './hooks.js'

export { Button } from './components/Button.js'
export type { ButtonProps } from './components/Button.js'
export { Composer } from './components/Composer.js'
export type { ComposerProps } from './components/Composer.js'
export { PromptInput } from './components/PromptInput.js'
export type { PromptInputProps } from './components/PromptInput.js'
export { ActivityOrb } from './components/ActivityOrb.js'
export type { ActivityOrbProps, ActivityOrbState } from './components/ActivityOrb.js'
export { Thread } from './components/Thread.js'
export type { ThreadProps } from './components/Thread.js'
export { Avatar, initialsOf } from './components/Avatar.js'
export type { AvatarProps } from './components/Avatar.js'
export { Markdown } from './components/Markdown.js'
export type { MarkdownProps } from './components/Markdown.js'
export { CodeBlock } from './components/CodeBlock.js'
export type { CodeBlockProps } from './components/CodeBlock.js'
export { SuggestionChips } from './components/SuggestionChips.js'
export type { SuggestionChipsProps } from './components/SuggestionChips.js'
export { MessageActions } from './components/MessageActions.js'
export type { MessageActionsProps } from './components/MessageActions.js'
export { Message } from './components/Message.js'
export type { MessageProps } from './components/Message.js'
export { Reasoning } from './components/Reasoning.js'
export type { ReasoningProps } from './components/Reasoning.js'
export { StateNotice } from './components/StateNotice.js'
export type { StateNoticeProps, NoticeState } from './components/StateNotice.js'
export { Icons, useIconOverride } from './components/icon-context.js'
export type {
  IconProps,
  IconComponent,
  IconOverrides,
  IconProviderProps,
} from './components/icon-context.js'
export { StateIcon } from './components/StateIcon.js'
export type { StateIconProps, IconName } from './components/StateIcon.js'
export { ToolCall } from './components/ToolCall.js'
export type { ToolCallProps } from './components/ToolCall.js'

export { VERSION } from 'lucet'
