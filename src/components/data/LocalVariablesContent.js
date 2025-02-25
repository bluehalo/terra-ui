import FileSaver from 'file-saver'
import _ from 'lodash/fp'
import { Fragment, useEffect, useState } from 'react'
import { div, h } from 'react-hyperscript-helpers'
import { AutoSizer } from 'react-virtualized'
import { ButtonPrimary, Link, Select, spinnerOverlay } from 'src/components/common'
import { renderDataCell, saveScroll } from 'src/components/data/data-utils'
import Dropzone from 'src/components/Dropzone'
import FloatingActionButton from 'src/components/FloatingActionButton'
import { icon } from 'src/components/icons'
import { DelayedSearchInput, TextInput } from 'src/components/input'
import Modal from 'src/components/Modal'
import { FlexTable, HeaderCell } from 'src/components/table'
import { Ajax } from 'src/libs/ajax'
import colors from 'src/libs/colors'
import { withErrorReporting } from 'src/libs/error'
import * as StateHistory from 'src/libs/state-history'
import * as Utils from 'src/libs/utils'


const LocalVariablesContent = ({ workspace, workspace: { workspace: { namespace, name } }, firstRender, refreshKey }) => {
  const signal = Utils.useCancellation()

  const [editIndex, setEditIndex] = useState()
  const [deleteIndex, setDeleteIndex] = useState()
  const [editKey, setEditKey] = useState()
  const [editValue, setEditValue] = useState()
  const [editType, setEditType] = useState()
  const [textFilter, setTextFilter] = useState('')

  const [busy, setBusy] = useState()
  const [attributes, setAttributes] = useState()

  const loadAttributes = _.flow(
    withErrorReporting('Error loading workspace data'),
    Utils.withBusyState(setBusy)
  )(async () => {
    const { workspace: { attributes } } = await Ajax(signal).Workspaces.workspace(namespace, name).details(['workspace.attributes'])
    setAttributes(attributes)
  })

  useEffect(() => {
    loadAttributes()
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopEditing = () => {
    setEditIndex()
    setEditKey()
    setEditValue()
    setEditType()
  }

  const initialAttributes = _.flow(
    _.toPairs,
    _.remove(([key]) => /^description$|:|^referenceData_/.test(key))
  )(attributes)

  const creatingNewVariable = editIndex === initialAttributes.length
  const amendedAttributes = _.flow(
    _.filter(([key, value]) => Utils.textMatch(textFilter, `${key} ${value}`)),
    _.sortBy(_.first),
    arr => [...arr, ...(creatingNewVariable ? [['', '']] : [])]
  )(initialAttributes)

  const inputErrors = editIndex !== undefined && [
    ...(_.keys(_.unset(amendedAttributes[editIndex][0], attributes)).includes(editKey) ? ['Key must be unique'] : []),
    ...(!/^[\w-]*$/.test(editKey) ? ['Key can only contain letters, numbers, underscores, and dashes'] : []),
    ...(editKey === 'description' ? ['Key cannot be \'description\''] : []),
    ...(editKey.startsWith('referenceData_') ? ['Key cannot start with \'referenceData_\''] : []),
    ...(!editKey ? ['Key is required'] : []),
    ...(!editValue ? ['Value is required'] : []),
    ...(editValue && editType === 'number' && Utils.cantBeNumber(editValue) ? ['Value is not a number'] : []),
    ...(editValue && editType === 'number list' && _.some(Utils.cantBeNumber, editValue.split(',')) ?
      ['Value is not a comma-separated list of numbers'] : [])
  ]

  const saveAttribute = _.flow(
    withErrorReporting('Error saving change to workspace variables'),
    Utils.withBusyState(setBusy)
  )(async originalKey => {
    const isList = editType.includes('list')
    const newBaseType = isList ? editType.slice(0, -5) : editType

    const parsedValue = isList ? _.map(Utils.convertValue(newBaseType), editValue.split(/,\s*/)) :
      Utils.convertValue(newBaseType, editValue)

    await Ajax().Workspaces.workspace(namespace, name).shallowMergeNewAttributes({ [editKey]: parsedValue })

    if (editKey !== originalKey) {
      await Ajax().Workspaces.workspace(namespace, name).deleteAttributes([originalKey])
    }

    await loadAttributes()
    stopEditing()
    setTextFilter('')
  })

  const upload = _.flow(
    withErrorReporting('Error uploading file'),
    Utils.withBusyState(setBusy)
  )(async ([file]) => {
    await Ajax().Workspaces.workspace(namespace, name).importAttributes(file)
    await loadAttributes()
  })

  const download = _.flow(
    withErrorReporting('Error downloading attributes'),
    Utils.withBusyState(setBusy)
  )(async () => {
    const blob = await Ajax().Workspaces.workspace(namespace, name).exportAttributes()
    FileSaver.saveAs(blob, `${name}-workspace-attributes.tsv`)
  })

  const { initialY } = firstRender ? StateHistory.get() : {}
  return h(Dropzone, {
    disabled: !!Utils.editWorkspaceError(workspace),
    style: { flex: 1, display: 'flex', flexDirection: 'column' },
    activeStyle: { backgroundColor: colors.accent(0.2), cursor: 'copy' },
    onDropAccepted: upload
  }, [({ openUploader }) => h(Fragment, [
    div({ style: { flex: 'none', display: 'flex', alignItems: 'center', marginBottom: '1rem', justifyContent: 'flex-end' } }, [
      h(Link, { onClick: download }, ['Download TSV']),
      !Utils.editWorkspaceError(workspace) && h(Fragment, [
        div({ style: { whiteSpace: 'pre' } }, ['  |  Drag or click to ']),
        h(Link, { onClick: openUploader }, ['upload TSV'])
      ]),
      h(DelayedSearchInput, {
        'aria-label': 'Search',
        style: { width: 300, marginLeft: '1rem' },
        placeholder: 'Search',
        onChange: setTextFilter,
        value: textFilter
      })
    ]),
    div({ style: { flex: 1 } }, [
      h(AutoSizer, [({ width, height }) => h(FlexTable, {
        width, height, rowCount: amendedAttributes.length,
        onScroll: y => saveScroll(0, y),
        initialY,
        hoverHighlight: true,
        tableName: 'workspace data local variables table',
        noContentMessage: _.isEmpty(initialAttributes) ? 'No Workspace Data defined' : 'No matching data',
        columns: [{
          size: { basis: 400, grow: 0 },
          headerRenderer: () => h(HeaderCell, ['Key']),
          cellRenderer: ({ rowIndex }) => editIndex === rowIndex ?
            h(TextInput, {
              'aria-label': 'Workspace data key',
              autoFocus: true,
              value: editKey,
              onChange: setEditKey
            }) :
            renderDataCell(amendedAttributes[rowIndex][0], namespace)
        }, {
          size: { grow: 1 },
          headerRenderer: () => h(HeaderCell, ['Value']),
          cellRenderer: ({ rowIndex }) => {
            const [originalKey, originalValue] = amendedAttributes[rowIndex]

            return h(Fragment, [
              div({ style: { flex: 1, minWidth: 0, display: 'flex' } }, [
                editIndex === rowIndex ?
                  h(TextInput, {
                    'aria-label': 'Workspace data value',
                    value: editValue,
                    onChange: setEditValue
                  }) :
                  renderDataCell(originalValue, namespace)
              ]),
              editIndex === rowIndex ?
                h(Fragment, [
                  h(Select, {
                    styles: { container: base => ({ ...base, marginLeft: '1rem', width: 150 }) },
                    isSearchable: false,
                    isClearable: false,
                    menuPortalTarget: document.getElementById('root'),
                    getOptionLabel: ({ value }) => _.startCase(value),
                    value: editType,
                    onChange: ({ value }) => setEditType(value),
                    options: ['string', 'number', 'boolean', 'string list', 'number list', 'boolean list']
                  }),
                  h(Link, {
                    tooltip: Utils.summarizeErrors(inputErrors) || 'Save changes',
                    disabled: !!inputErrors.length,
                    style: { marginLeft: '1rem' },
                    onClick: () => saveAttribute(originalKey)
                  }, [icon('success-standard', { size: 23 })]),
                  h(Link, {
                    tooltip: 'Cancel editing',
                    style: { marginLeft: '1rem' },
                    onClick: stopEditing
                  }, [icon('times-circle', { size: 23 })])
                ]) :
                div({ className: 'hover-only' }, [
                  h(Link, {
                    disabled: !!Utils.editWorkspaceError(workspace),
                    tooltip: Utils.editWorkspaceError(workspace) || 'Edit variable',
                    style: { marginLeft: '1rem' },
                    onClick: () => {
                      setEditIndex(rowIndex)
                      setEditValue(_.isObject(originalValue) ? originalValue.items.join(', ') : originalValue)
                      setEditKey(originalKey)
                      setEditType(_.isObject(originalValue) ? `${typeof originalValue.items[0]} list` : typeof originalValue)
                    }
                  }, [icon('edit', { size: 19 })]),
                  h(Link, {
                    'aria-label': 'Delete variable',
                    disabled: !!Utils.editWorkspaceError(workspace),
                    tooltip: Utils.editWorkspaceError(workspace) || 'Delete variable',
                    style: { marginLeft: '1rem' },
                    onClick: () => setDeleteIndex(rowIndex)
                  }, [icon('trash', { size: 19 })])
                ])
            ])
          }
        }]
      })])
    ]),
    !creatingNewVariable && editIndex === undefined && !Utils.editWorkspaceError(workspace) && h(FloatingActionButton, {
      label: 'ADD VARIABLE',
      iconShape: 'plus',
      onClick: () => {
        setEditIndex(initialAttributes.length)
        setEditValue('')
        setEditKey('')
        setEditType('string')
      }
    }),
    deleteIndex !== undefined && h(Modal, {
      onDismiss: () => setDeleteIndex(),
      title: 'Are you sure you wish to delete this variable?',
      okButton: h(ButtonPrimary, {
        onClick: _.flow(
          withErrorReporting('Error deleting workspace variable'),
          Utils.withBusyState(setBusy)
        )(async () => {
          setDeleteIndex()
          await Ajax().Workspaces.workspace(namespace, name).deleteAttributes([amendedAttributes[deleteIndex][0]])
          await loadAttributes()
        })
      },
      'Delete Variable')
    }, ['This will permanently delete the data from Workspace Data.']),
    busy && spinnerOverlay
  ])])
}

export default LocalVariablesContent
