import { defineConfig } from 'orval'

/**
 * Генератор клиента. Источник — закоммиченный `contract/openapi.yaml`,
 * результат — файл `src/api/generated/`, который не коммитится.
 *
 * Мутатор наш собственный: адрес сервера он берёт из `src/api/config.ts`,
 * где имя переменной окружения проверяется компилятором, а разбор отказа
 * оставляет вызывающему коду — здесь только запрос и тело ответа.
 */
export default defineConfig({
  calendarApi: {
    input: {
      target: './contract/openapi.yaml',
    },
    output: {
      target: './src/api/generated/calendar-api.ts',
      client: 'fetch',
      override: {
        mutator: {
          path: './src/api/mutator.ts',
          name: 'customInstance',
        },
      },
    },
  },
})