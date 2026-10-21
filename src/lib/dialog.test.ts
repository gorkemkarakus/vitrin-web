import { describe, expect, it } from 'vitest'
import { askConfirm, closeDialog, currentDialog, showAlert } from './dialog'

describe('dialog', () => {
  it('onay penceresi sirayla acilir, verilen cevapla kapanir', async () => {
    const first = askConfirm({ title: 'Silinsin mi?', danger: true })
    const second = showAlert('Kaydedilemedi')
    expect(currentDialog()?.title).toBe('Silinsin mi?')
    closeDialog(false)
    await expect(first).resolves.toBe(false)
    expect(currentDialog()?.alertOnly).toBe(true)
    closeDialog(true)
    await expect(second).resolves.toBeUndefined()
    expect(currentDialog()).toBeUndefined()
  })
})
