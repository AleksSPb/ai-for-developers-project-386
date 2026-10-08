import { Text } from '@mantine/core'

import { remainingIn, type TextField } from '../app/textLimits'

interface LengthCounterProps {
  field: TextField
  value: string
}

/**
 * Счётчик остатка под полем.
 *
 * Стоит **до** того, как текст потерян: молчаливое обрезание отнимало бы его без
 * предупреждения, а счётчик даёт увидеть границу заранее.
 *
 * Обрезать введённое форма не станет — она просто перестаёт принимать символ, и
 * счётчик показывает «Осталось: 0». Это молчание в момент отказа, а не потеря
 * написанного.
 */
const LengthCounter = ({ field, value }: LengthCounterProps) => (
  <Text size="xs" c="dimmed">
    {`Осталось символов: ${remainingIn(field, value)}`}
  </Text>
)

export default LengthCounter