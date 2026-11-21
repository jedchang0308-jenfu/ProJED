export type ProjectChangePreviewSource = {
  readonly draftId: string | null;
  readonly draftSignature: string | null;
  readonly accountId: string | null;
  readonly authContextId: string | null;
  readonly workspaceId: string | null;
  readonly boardId: string | null;
};

export type ProjectChangePreviewStateLike = {
  readonly dismissedDraftId: string | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  readonly stepState: 'pending' | 'skipped' | 'inserted';
  readonly previewContent: string;
  readonly eventCount: number;
  readonly message: string | null;
  readonly sourceKey: string | null;
};

export const projectChangePreviewSourceKey = (source: ProjectChangePreviewSource) => JSON.stringify([
  source.draftId,
  source.draftSignature,
  source.accountId,
  source.authContextId,
  source.workspaceId,
  source.boardId,
]);

export const isProjectChangePreviewForCurrentSource = (
  previewSourceKey: string | null,
  source: ProjectChangePreviewSource,
): boolean => previewSourceKey !== null
  && previewSourceKey === projectChangePreviewSourceKey(source);

export const resetProjectChangePreviewForSourceChange = <T extends ProjectChangePreviewStateLike>(state: T): T => ({
  ...state,
  dismissedDraftId: null,
  status: 'idle',
  stepState: 'pending',
  previewContent: '',
  eventCount: 0,
  message: null,
  sourceKey: null,
});

export class ProjectChangePreviewRequestGate {
  private sourceKey: string;
  private generation = 0;
  private insertedSourceKey: string | null = null;

  constructor(source: ProjectChangePreviewSource) {
    this.sourceKey = projectChangePreviewSourceKey(source);
  }

  begin(source: ProjectChangePreviewSource): number {
    this.syncSource(source);
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number, source: ProjectChangePreviewSource): boolean {
    return generation === this.generation
      && projectChangePreviewSourceKey(source) === this.sourceKey;
  }

  cancel(): void {
    this.generation += 1;
  }

  markInserted(source: ProjectChangePreviewSource): void {
    this.insertedSourceKey = projectChangePreviewSourceKey(source);
  }

  reconcileSource<T extends ProjectChangePreviewStateLike>(
    source: ProjectChangePreviewSource,
    state: T,
  ): { changed: boolean; state: T } {
    const nextSourceKey = projectChangePreviewSourceKey(source);
    if (nextSourceKey === this.sourceKey) return { changed: false, state };

    this.sourceKey = nextSourceKey;
    this.generation += 1;
    const preserveInsertedStep = state.stepState === 'inserted'
      && this.insertedSourceKey === nextSourceKey;
    this.insertedSourceKey = null;
    return {
      changed: true,
      state: preserveInsertedStep ? state : resetProjectChangePreviewForSourceChange(state),
    };
  }

  private syncSource(source: ProjectChangePreviewSource): void {
    const nextSourceKey = projectChangePreviewSourceKey(source);
    if (nextSourceKey === this.sourceKey) return;
    this.sourceKey = nextSourceKey;
    this.generation += 1;
    this.insertedSourceKey = null;
  }
}
