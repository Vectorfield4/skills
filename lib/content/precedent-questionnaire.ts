/**
 * Precedent questionnaire — the contract marketing fills in before a case page
 * or a solution precedent may be written.
 *
 * Type-only: `lib/yaml/typescript.mjs` reads this file as text to validate
 * `data/<domain>/precedent-questionnaire.yaml` and to print the questions.
 * Nothing imports it at runtime, so it stays erasable TypeScript — no enums,
 * no classes, one member per line.
 *
 * Every field maps to a page block or to a publication gate. The `@question`
 * tag is what a human sees in the YAML file, `@example` is a filled sample,
 * `@default` pre-fills the skeleton and `@count` says how many list items the
 * skeleton generates.
 */

/** @values draft | filled | reviewed | rejected */
export type QuestionnaireStatus = "draft" | "filled" | "reviewed" | "rejected";

/** @values name | industry-and-scale | anonymous */
export type DisclosureLevel = "name" | "industry-and-scale" | "anonymous";

/** @values measured | estimated | claimed */
export type MetricConfidence = "measured" | "estimated" | "claimed";

/** @values system-log | client-report | acceptance-act | interview | estimate */
export type MetricSource = "system-log" | "client-report" | "acceptance-act" | "interview" | "estimate";

/** @values lower-is-better | higher-is-better */
export type MetricDirection = "lower-is-better" | "higher-is-better";

/** @values absolute | relative-percent | percentage-points */
export type DeltaKind = "absolute" | "relative-percent" | "percentage-points";

/** @values cloud | on-prem | hybrid | client-infrastructure */
export type Deployment = "cloud" | "on-prem" | "hybrid" | "client-infrastructure";

/** @values case | solution-precedent | article | investors-page | sales-deck */
export type PublishChannel = "case" | "solution-precedent" | "article" | "investors-page" | "sales-deck";

/** @values act | screenshot | log | report | video | contract | dataset-sample */
export type ArtifactKind = "act" | "screenshot" | "log" | "report" | "video" | "contract" | "dataset-sample";

/** @values fixed-price | time-and-materials | retainer | pilot */
export type ContractType = "fixed-price" | "time-and-materials" | "retainer" | "pilot";

/** @values pilot | implementation | platform | custom */
export type PackageSold = "pilot" | "implementation" | "platform" | "custom";

/** A closed interval; `to` stays null while the measurement still runs. */
export interface DateRange {
  /** @question 5.4a Начало периода, ISO-дата @example "2026-09-01" */
  from: string;
  /** @question 5.4b Конец периода, ISO-дата; null, если замер идёт @example "2026-10-15" */
  to: string | null;
}

/** One number with its baseline, its measurement window and its proof. */
export interface PrecedentMetric {
  /** @question 5.0 Короткий id метрики, латиница и дефисы @default null */
  id?: string;
  /** @question 5.1 Название метрики как её называет клиент @example Время на приёмку квартиры */
  name: string;
  /** @question 5.2 Единица измерения @example мин */
  unit: string;
  /** @question 5.3a Значение до проекта; null, если базовой линии не было @example 70 */
  baseline: number | null;
  /** @question 5.3b Значение после проекта @example 25 */
  after: number | null;
  /** @question 5.3c Как выражена разница: absolute | relative-percent | percentage-points @default absolute */
  deltaKind?: DeltaKind;
  /** @question 5.3d Что лучше: lower-is-better | higher-is-better @default lower-is-better */
  direction?: MetricDirection;
  /** Считает валидатор, человек не заполняет. @default null */
  delta?: number | null;
  /** @question 5.4 Окно замера: с какого по какое число считали @default null */
  window?: DateRange | null;
  /** @question 5.5 Метод: что именно измерили, на какой выборке @example Хронометраж обхода прорабом, 40 квартир, одна стадия отделки */
  method: string;
  /** @question 5.6 Источник цифры: system-log | client-report | acceptance-act | interview | estimate */
  source: MetricSource;
  /** @question 5.7 Путь к файлу-доказательству в репозитории @default null */
  evidencePath?: string | null;
  /** @question 5.8 Уверенность: measured | estimated | claimed @default measured */
  confidence?: MetricConfidence;
  /** @question 5.9 Кто со стороны клиента подтвердит цифру и чем @default null */
  confirmedBy?: string | null;
}

/** Who gave the facts and who answers for them. */
export interface InterviewMeta {
  /** @question 0.7a Кто дал факты: имя @default не указан */
  respondent: string;
  /** @question 0.7b Роль респондента @default не указана */
  role: string;
  /** @question 0.7c Отдел, который заполняет файл @default маркетинг */
  department: string;
  /** @question 0.7d Дата интервью, ISO @default null */
  interviewDate: string;
  /** @question 0.7e Кто заполнил файл @default маркетинг */
  filledBy: string;
  /** @question 0.7f Кто проверил; null, если проверки ещё не было @default null */
  reviewer?: string | null;
  /** @question 0.7g Внутренний код проекта или договора; null, если кода нет @default null */
  projectCode?: string | null;
}

/** Size of the client's operation; the numbers that make the story concrete. */
export interface ClientScale {
  /** @question 0.6a Объектов (ЖК, производств, складов) @default null */
  objects?: number | null;
  /** @question 0.6b Единиц: квартир, SKU, рабочих мест @default null */
  units?: number | null;
  /** @question 0.6c Площадь, м² @default null */
  sqm: number | null;
  /** @question 0.6d Сотрудников у клиента @default null */
  employees: number | null;
}

/** How the work was bought. */
export interface ClientContract {
  /** @question 6.0a Тип договора: fixed-price | time-and-materials | retainer | pilot */
  type: ContractType;
  /** @question 6.0b Вилка бюджета, если её можно назвать @default null */
  budgetBand: string | null;
  /** @question 6.0c Дата подписания, ISO @default null */
  signedAt: string | null;
}

/** The client as the page may describe him. */
export interface ClientBlock {
  /** @question 1.1 Что разрешено раскрыть: name | industry-and-scale | anonymous @default industry-and-scale */
  disclosure: DisclosureLevel;
  /** @question 1.2 Название клиента; заполнять только при disclosure: name @default null */
  name?: string | null;
  /** @question 0.3 Отрасль клиента своими словами @example жилищное строительство */
  industry: string;
  /** @question 0.4 Ключ аудитории из словаря проекта @default audiences.businessOwners */
  audienceKey: string;
  /** @question 0.5 Регион @example Москва */
  region: string;
  /** @question 0.6 Масштаб операции */
  scale: ClientScale;
  /** @question 6.0 Договор */
  contract: ClientContract;
}

/** One line of what the status quo cost. */
export interface StatusQuoCost {
  /** @question 2.3a Статья затрат @example повторный выезд бригады */
  name: string;
  /** @question 2.3b Значение с единицей @example 15 000-40 000 ₽ на квартиру */
  value: string;
  /** @question 2.3c Откуда число: отчёт клиента, смета, интервью @example смета генподрядчика */
  source: string;
}

/** Why the project happened at all. */
export interface ProblemBlock {
  /**
   * @question 2.1 Как процесс работал до проекта, по шагам
   * @example Обход с бумажным чек-листом, фото в WhatsApp, акт подписывают от руки
   */
  beforeProcess: string;
  /** @question 2.2 Что стало триггером проекта @example срыв сдачи второй очереди */
  trigger: string;
  /** @question 2.3 Что стоило прежнее состояние; минимум одна строка @count 1 */
  costOfStatusQuo: StatusQuoCost[];
  /** @question 2.4 Что уже пробовали и почему не сработало @default null */
  failedAttempts?: string | null;
}

/** How big the team was. */
export interface SolutionTeam {
  /** @question 3.8a naszych людей @example 4 */
  ours: number | null;
  /** @question 3.8b людей на стороне клиента @example 2 */
  client: number | null;
  /** @question 3.8c роли в команде @count 1 */
  roles: string[];
}

/** One volume the solution runs on. */
export interface VolumeItem {
  /** @question 3.6a Что считаем @example квартир в месяц */
  name: string;
  /** @question 3.6b Значение с единицей @example 240 */
  value: string;
}

/** What was built. */
export interface SolutionBlock {
  /** @question 3.1 Одним предложением, что построили @example CV-приёмка отделки квартиры по видео с телефона */
  oneLiner: string;
  /** @question 3.2 Что вошло в scope @count 1 */
  scope: string[];
  /** @question 3.3 Что сознательно не вошло; пустой список = незакрытая граница @count 1 */
  outOfScope: string[];
  /** @question 3.4 Slug'и услуг, которые уже были на сайте @count 1 */
  services: string[];
  /** @question 3.4b Slug решения, если проект относится к одному; иначе null @default null */
  solutionSlug?: string | null;
  /** @question 3.5a Стек @count 0 */
  stack?: string[];
  /** @question 3.5b Интеграции @count 0 */
  integrations?: string[];
  /** @question 3.5c Источники данных @count 0 */
  dataSources?: string[];
  /** @question 3.6 Объёмы @count 0 */
  volumes?: VolumeItem[];
  /** @question 3.7 Где развёрнуто: cloud | on-prem | hybrid | client-infrastructure */
  deployment: Deployment;
  /** @question 3.7b Железо и устройства; null, если не применялось @default null */
  hardware?: string | null;
  /** @question 3.8 Команда @count 0 */
  team?: SolutionTeam;
}

/** One honest slip. */
export interface TimelineSlip {
  /** @question 4.3a Что сдвинулось @example разметка трещин */
  what: string;
  /** @question 4.3b На сколько недель @example 2 */
  weeks: number | null;
  /** @question 4.3c Почему @example не сошёлся класс на рельефной плитке */
  reason: string;
}

/** When it happened and over which window the result was measured. */
export interface TimelineBlock {
  /** @question 4.1a Старт проекта, ISO @example "2026-08-01" */
  kickoff: string;
  /** @question 4.1b Конец пилота, ISO; null, если пилота не было @default null */
  pilotEnd?: string | null;
  /** @question 4.1c Старт промышленной эксплуатации, ISO @default null */
  productionStart?: string | null;
  /** @question 4.2 Окно замера результата */
  measurement?: DateRange | null;
  /** @question 4.1d Длительность в неделях @default null */
  durationWeeks?: number | null;
  /** @question 4.3 Сдвиги срока; пустой список допустим @count 0 */
  slips?: TimelineSlip[];
}

/** What the project changed, and what it did not. */
export interface ResultsBlock {
  /**
   * @question 5. Основные метрики: ровно три для карточки кейса, минимум одна для прецедента решения
   * @count 3
   */
  primary: PrecedentMetric[];
  /** @question 5b Дополнительные метрики, которые не попали в карточку @count 0 */
  secondary?: PrecedentMetric[];
  /** @question 5.9 Качественные изменения без цифр, каждое — наблюдаемый факт @count 0 */
  qualitative?: string[];
  /** @question 5.10 Что не сработало и что осталось за рамками; минимум одна строка @count 1 */
  whatDidNotWork: string[];
}

/** One artifact that proves a number. */
export interface EvidenceArtifact {
  /** @question 7.1a Тип: act | screenshot | log | report | video | contract | dataset-sample */
  kind: ArtifactKind;
  /** @question 7.1b Путь к файлу @example docs/evidence/protocol-42.pdf */
  path: string;
  /** @question 7.1c Есть ли на нём персональные данные @default false */
  pii?: boolean;
  /** @question 7.1d Что доказывает @default null */
  note?: string;
}

/** A person who can confirm the result. */
export interface EvidenceContact {
  /** @question 7.3a Роль @example руководитель стройконтроля */
  role: string;
  /** @question 7.3b Контакт; null, если контакт не публикуем @default null */
  contact: string | null;
}

/** Proof behind the numbers. */
export interface EvidenceBlock {
  /** @question 7.1 Артефакты @count 1 */
  artifacts: EvidenceArtifact[];
  /** @question 7.3 Кто подтвердит результат @count 0 */
  whoCanConfirm?: EvidenceContact[];
  /** @question 7.2 Что вырезаем или замазываем перед публикацией @count 0 */
  anonymization?: string[];
}

/** What was sold and who owns the result. */
export interface CommercialBlock {
  /** @question 6.1 Какой пакет продали: pilot | implementation | platform | custom */
  packageSold: PackageSold;
  /** @question 6.2 Бюджетный диапазон; null, если раскрывать нельзя @default null */
  priceBand?: string | null;
  /** @question 6.3 Регулярные платежи @default null */
  recurring?: string | null;
  /** @question 6.4 Что принадлежит клиенту: код, веса, данные, протоколы @count 1 */
  clientOwns: string[];
  /** @question 6.5 Продление и следующий этап @default null */
  renewal?: string | null;
}

/** A client quote, only when it is approved. */
export interface ClientQuote {
  /** @question 8.2a Текст цитаты @example Протокол собираем за один обход */
  text: string;
  /** @question 8.2b Роль автора, без имени, если имя не согласовано @example руководитель стройконтроля */
  authorRole: string;
  /** @question 8.2c Цитата согласована клиентом @default false */
  approved: boolean;
}

/** What may be published, where, and next to what. */
export interface PublicationBlock {
  /** @question 8.0 Клиент разрешил публикацию @default false */
  allowed: boolean;
  /** @question 8.1 Каналы: case | solution-precedent | article | investors-page | sales-deck @count 1 */
  channels: PublishChannel[];
  /** @question 8.2 Цитата; null, если цитаты нет @default null */
  quote?: ClientQuote | null;
  /** @question 1.3 Ограничения NDA @count 0 */
  ndaConstraints?: string[];
  /** @question 8.3a Связанные услуги, slug'и @count 1 */
  relatedServices: string[];
  /** @question 8.3b Связанные решения, slug'и @count 0 */
  relatedSolutions?: string[];
  /** @question 8.3c Связанные кейсы, slug'и @count 0 */
  relatedCases?: string[];
  /** @question 8.4 Идеи статей из этого проекта @count 0 */
  articleAngles?: string[];
}

/** Filled by the checker, never by a human. */
export interface GateReport {
  /** Доля заполненных обязательных полей, 0..1 */
  completeness: number;
  /** Что не даёт опубликовать страницу */
  blocking: string[];
  /** Что стоит поправить, но не блокирует */
  warnings: string[];
}

/**
 * The filled questionnaire. One file per case:
 * `data/<domain>/precedent-questionnaire.yaml`.
 */
export interface PrecedentQuestionnaire {
  /** @question — Version of this contract; do not edit. @default "1.0" */
  schemaVersion: "1.0";
  /** @question 0.8 Состояние файла: draft | filled | reviewed | rejected @default draft */
  status: QuestionnaireStatus;
  /** @question 0.1 Slug страницы, латиница и дефисы @example cv-acceptance-control */
  slug: string;
  /** @question 0.2 Рабочее название кейса @example CV-приёмка квартир у субподрядчика */
  workingTitle: string;
  /** @question — Дата последнего изменения, ISO */
  updatedAt: string;
  /** @question 0.7 Кто дал факты */
  meta: InterviewMeta;
  /** @question 1. Клиент и разрешение на публикацию */
  client: ClientBlock;
  /** @question 2. Проблема до проекта */
  problem: ProblemBlock;
  /** @question 3. Что построили */
  solution: SolutionBlock;
  /** @question 4. Сроки и окно замера */
  timeline: TimelineBlock;
  /** @question 5. Результаты */
  results: ResultsBlock;
  /** @question 6. Экономика */
  commercial: CommercialBlock;
  /** @question 7. Доказательства */
  evidence: EvidenceBlock;
  /** @question 8. Публикация */
  publication: PublicationBlock;
  /** Отчёт проверок; заполняет скрипт. @default null */
  gates: GateReport | null;
}
