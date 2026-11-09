import { atom } from 'jotai'

/** 編集画面に保存していない変更があるか。タブバーで別の画面に移るときに確認する。 */
export const unsavedChangesAtom = atom(false)
