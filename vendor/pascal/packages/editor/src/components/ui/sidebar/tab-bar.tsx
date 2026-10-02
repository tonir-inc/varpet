'use client'

import type { ReactNode } from 'react'
import { editorHostPanelRegistry } from '../../../lib/plugin-panels'
import { triggerSFX } from './../../../lib/sfx-bus'
import { cn } from './../../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip'

export type SidebarTab = {
  id: string
  label: string
  mobileDefaultSnap?: number
  mobileIcon?: ReactNode
  /** Desktop icon shown in the vertical rail (v2 layout). */
  icon?: ReactNode
  /**
   * Rail entry that drives the stage instead of opening a sidebar panel:
   * activating it hides the panel column (preserving its collapse state) and
   * keeps the icon highlighted regardless of collapse.
   */
  noPanel?: boolean
}

interface TabBarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-border/50 border-b px-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            className={cn(
              'relative h-7 rounded-md px-3 font-medium text-sm transition-colors',
              isActive
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
            key={tab.id}
            onClick={() => {
              triggerSFX('sfx:menu-click')
              onTabChange(tab.id)
            }}
            onMouseEnter={() => triggerSFX('sfx:menu-hover')}
            type="button"
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

/** Desktop rail width (px) unless the host sets `rail.width`: the `w-14` rail. */
export const DEFAULT_RAIL_WIDTH = 56

/** How the v2 rail looks (Editor's `rail` prop). */
export type RailOptions = {
  /** Rail width in px; the sidebar resize math follows it. Default 56. */
  width?: number
  /** Show each tab's label under its icon instead of only as a hover tooltip. */
  labels?: boolean
}

interface IconRailProps extends RailOptions {
  tabs: SidebarTab[]
  /** Highlighted tab. Stays highlighted while the panel is collapsed. */
  activeTab: string
  /** True when the panel beside the rail is collapsed. */
  collapsed: boolean
  /** Clicking a rail icon: switch tab, or toggle the panel (see layout). */
  onIconClick: (id: string) => void
}

/**
 * Vertical icon rail for the v2 left column. Always visible (even when the
 * panel is collapsed) so the user can reopen the panel by clicking an icon.
 * The label renders as a hover tooltip on the right.
 */
export function IconRail({
  tabs,
  activeTab,
  collapsed,
  onIconClick,
  width = DEFAULT_RAIL_WIDTH,
  labels = false,
}: IconRailProps) {
  const pluginPanelIds = new Set(
    editorHostPanelRegistry.getSnapshot().flatMap((panel) =>
      panel.pluginId ? [panel.id] : [],
    ),
  )
  const defaultTabs = tabs.filter((tab) => !pluginPanelIds.has(tab.id) && tab.id !== 'plugins')
  const pluginTabs = tabs.filter((tab) => pluginPanelIds.has(tab.id) || tab.id === 'plugins')

  const renderTab = (tab: SidebarTab) => {
    const showActive = activeTab === tab.id && (!collapsed || tab.noPanel === true)
    const button = (
      <button
        aria-label={tab.label}
        aria-pressed={showActive}
        className={cn(
          'group flex items-center justify-center transition-all duration-200 [&_img]:transition-[opacity,filter] [&_img]:duration-200',
          labels ? 'w-full flex-col gap-1.5 rounded-md px-1 py-2' : 'h-11 w-11 rounded-xl',
          showActive
            ? 'bg-accent text-foreground shadow-sm [&_img]:opacity-100 [&_img]:grayscale-0'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground [&_img]:opacity-60 [&_img]:grayscale hover:[&_img]:opacity-100 hover:[&_img]:grayscale-0',
        )}
        data-rail-item={tab.id}
        key={tab.id}
        onClick={() => {
          triggerSFX('sfx:menu-click')
          onIconClick(tab.id)
        }}
        onMouseEnter={() => triggerSFX('sfx:menu-hover')}
        type="button"
      >
        {tab.icon ?? (labels ? null : tab.label.charAt(0))}
        {labels && (
          <span className="whitespace-nowrap text-[11px] leading-none" data-rail-label>
            {tab.label}
          </span>
        )}
      </button>
    )
    // A labelled rail already says what each tab is; no tooltip.
    if (labels) return button
    return (
      <Tooltip key={tab.id}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{tab.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={0} disableHoverableContent>
      <div
        className={cn(
          'flex h-full shrink-0 flex-col items-center gap-1 border-border/50 border-r py-2',
          labels && 'px-1',
        )}
        data-editor-rail
        style={{ width }}
      >
        {defaultTabs.map(renderTab)}
        {pluginTabs.length > 0 && (
          <div
            className={cn(
              'mt-1 flex flex-col items-center gap-1 border-border/70 border-t pt-2',
              labels ? 'w-full' : 'w-11',
            )}
          >
            {pluginTabs.map(renderTab)}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
