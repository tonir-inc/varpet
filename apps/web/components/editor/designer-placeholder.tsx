'use client'

/** Slot for lane D's designer panel; integration passes it to <SceneEditor designerPanel={...}>. */
export function DesignerPlaceholder() {
  return (
    <div className="varpet-panel-note">
      <h2>Designer</h2>
      <p>The designer chat will appear here.</p>
    </div>
  )
}
