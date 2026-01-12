export type ExplainContext = {
  themeId: string;
  themeTitle: string;
  correct: string[]; // ユーザーが正解したもの
  all: string[]; // 出題対象（paramsが無ければ空で良い）
};

export type ExplainPromptId = string;

export type ExplainPrompt = {
  id: ExplainPromptId;
  label: string;
  tone?: 'primary' | 'default';
  needsSelection?: boolean;
};

export type ExplainSelection = {
  type: 'entity';
  label: string;
  options: string[];
  defaultValue?: string;
};

export type ExplainMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type ExplainBuilt = {
  selection?: ExplainSelection | null;
  prompts: ExplainPrompt[];
  intro: string;
  facts: unknown;
};

export type ExplainAdapter = {
  canHandle(themeId: string): boolean;
  build(ctx: ExplainContext): ExplainBuilt;
  answer(args: { promptId: ExplainPromptId; selectionValue?: string }, built: ExplainBuilt): string;
};


