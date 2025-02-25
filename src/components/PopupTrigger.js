import { Children, cloneElement, Fragment, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { div, h } from 'react-hyperscript-helpers'
import onClickOutside from 'react-onclickoutside'
import { Clickable, FocusTrapper } from 'src/components/common'
import { icon } from 'src/components/icons'
import { computePopupPosition, PopupPortal, useDynamicPosition } from 'src/components/popup-utils'
import colors from 'src/libs/colors'
import * as Style from 'src/libs/style'
import * as Utils from 'src/libs/utils'


const styles = {
  popup: {
    position: 'fixed', top: 0, left: 0,
    backgroundColor: 'white',
    border: `1px solid ${colors.dark(0.55)}`, borderRadius: 4,
    boxShadow: Style.standardShadow
  }
}

// This is written as a "function" function rather than an arrow function because react-onclickoutside wants it to have a prototype
// eslint-disable-next-line prefer-arrow-callback
export const Popup = onClickOutside(function({ side = 'right', target: targetId, onClick, children }) {
  const elementRef = useRef()
  const [target, element, viewport] = useDynamicPosition([{ id: targetId }, { ref: elementRef }, { viewport: true }])
  const { position } = computePopupPosition({ side, target, element, viewport, gap: 10 })
  return h(PopupPortal, [
    div({
      onClick,
      ref: elementRef,
      style: {
        transform: `translate(${position.left}px, ${position.top}px)`,
        visibility: !viewport.width ? 'hidden' : undefined,
        ...styles.popup
      },
      role: 'dialog'
    }, [children])
  ])
})

const PopupTrigger = Utils.forwardRefWithName('PopupTrigger', ({ content, children, closeOnClick, onChange, ...props }, ref) => {
  const [open, setOpen] = useState(false)
  const id = Utils.useUniqueId()
  useImperativeHandle(ref, () => ({
    close: () => setOpen(false)
  }))

  useEffect(() => {
    onChange && onChange(open)
  }, [open, onChange])

  const child = Children.only(children)
  const childId = child.props.id || id
  return h(Fragment, [
    cloneElement(child, {
      id: childId,
      className: `${child.props.className || ''} ${childId}`,
      onClick: (...args) => {
        child.props.onClick && child.props.onClick(...args)
        setOpen(!open)
      }
    }),
    open && h(Popup, {
      target: childId,
      handleClickOutside: () => setOpen(false),
      outsideClickIgnoreClass: childId,
      onClick: closeOnClick ? () => setOpen(false) : undefined,
      ...props
    }, [h(FocusTrapper, { onBreakout: () => setOpen(false) }, [content])])
  ])
})

export default PopupTrigger

export const InfoBox = ({ size, children, style, side, tooltip, iconOverride }) => {
  const [open, setOpen] = useState(false)
  return h(PopupTrigger, {
    side,
    onChange: setOpen,
    content: div({ style: { padding: '0.5rem', width: 300 } }, [children])
  }, [
    h(Clickable, {
      tooltip,
      as: 'span', 'aria-label': 'More info', 'aria-expanded': open, 'aria-haspopup': true
    }, [
      icon(iconOverride || 'info-circle', { size, style: { cursor: 'pointer', color: colors.accent(), ...style } })
    ])
  ])
}
