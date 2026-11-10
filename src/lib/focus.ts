import { atom } from 'jotai'

/** フラッシュカードの練習中か。復習と同じく、集中できるようタブバーを隠す。 */
export const focusModeAtom = atom(false)
