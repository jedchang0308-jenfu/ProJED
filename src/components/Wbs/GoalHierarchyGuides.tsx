import React from 'react';
import type { GoalHierarchyDecoration } from '../../features/goalMode/hierarchyPresentation';
import type { GoalTreePreviewGeometry } from './taskDrag/goalDesktopTaskDragAdapter';

type GoalHierarchyGuideKind = 'continuation' | 'incoming-vertical' | 'incoming-branch' | 'child-stem' | 'root-branch';

type GoalHierarchyGuideSegmentProps = {
  kind: GoalHierarchyGuideKind;
  guideLevel: number;
  nodeLevel: number;
  ownerTaskId: string;
  active: boolean;
  style?: React.CSSProperties;
  previewSegment?: 'stem' | 'branch';
};

const GoalHierarchyGuideSegment: React.FC<GoalHierarchyGuideSegmentProps> = ({
  kind,
  guideLevel,
  nodeLevel,
  ownerTaskId,
  active,
  style,
  previewSegment,
}) => (
  <span
    className={`goal-hierarchy-guide-segment goal-hierarchy-guide-${kind}`}
    style={{
      '--goal-guide-level': guideLevel,
      '--goal-node-level': nodeLevel,
      ...style,
    } as React.CSSProperties}
    data-goal-hierarchy-guide-kind={kind}
    data-goal-hierarchy-guide-level={guideLevel}
    data-goal-hierarchy-guide-owner={ownerTaskId}
    data-goal-hierarchy-guide-active={active ? 'true' : 'false'}
    data-goal-drag-tree-preview-segment={previewSegment}
  />
);

type GoalHierarchyRowGuidesProps = {
  variant?: 'row';
  nodeId: string;
  level: number;
  hasChildren: boolean;
  decoration: GoalHierarchyDecoration;
  activeScopeId: string | null;
};

type GoalHierarchyPreviewGuidesProps = {
  variant: 'preview';
  treePreview: GoalTreePreviewGeometry;
  targetNodeId: string;
};

export type GoalHierarchyGuidesProps = GoalHierarchyRowGuidesProps | GoalHierarchyPreviewGuidesProps;

/**
 * The single Goal hierarchy renderer. Normal rows and fixed drag previews feed
 * it different coordinate inputs, but both use the same segment primitive,
 * active stroke rules, endpoints, and semantic metadata.
 */
export const GoalHierarchyGuides: React.FC<GoalHierarchyGuidesProps> = (props) => {
  if (props.variant === 'preview') {
    const { treePreview, targetNodeId } = props;
    const stemTop = Math.min(treePreview.stemStartY, treePreview.stemEndY);
    const stemHeight = Math.abs(treePreview.stemEndY - treePreview.stemStartY);
    const branchWidth = treePreview.branchEndX - treePreview.railCenterX;
    if (branchWidth <= 0) return null;
    const stemKind: GoalHierarchyGuideKind = treePreview.relationKind === 'child'
      ? 'child-stem'
      : 'incoming-vertical';
    const branchKind: GoalHierarchyGuideKind = treePreview.relationKind === 'root'
      ? 'root-branch'
      : 'incoming-branch';

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[94]"
        data-goal-hierarchy-guides="true"
        data-goal-hierarchy-guide-layer="preview"
        data-goal-drag-tree-preview="true"
        data-goal-drag-tree-preview-target={targetNodeId}
        data-goal-drag-tree-preview-kind={treePreview.relationKind}
      >
        {stemHeight > 0 ? (
          <GoalHierarchyGuideSegment
            kind={stemKind}
            guideLevel={0}
            nodeLevel={0}
            ownerTaskId={targetNodeId}
            active
            previewSegment="stem"
            style={{
              left: treePreview.railCenterX,
              top: stemTop,
              bottom: 'auto',
              height: stemHeight,
            }}
          />
        ) : null}
        <GoalHierarchyGuideSegment
          kind={branchKind}
          guideLevel={0}
          nodeLevel={0}
          ownerTaskId={targetNodeId}
          active
          previewSegment="branch"
          style={{
            left: treePreview.railCenterX,
            top: treePreview.boundaryY,
            width: branchWidth,
          }}
        />
      </div>
    );
  }

  const { nodeId, level, hasChildren, decoration, activeScopeId } = props;
  const activeAncestorIndex = activeScopeId ? decoration.ancestorTaskIds.indexOf(activeScopeId) : -1;
  const nodeIsInActiveScope = Boolean(activeScopeId)
    && (nodeId === activeScopeId || activeAncestorIndex >= 0);
  const isRelationActive = (ownerTaskId: string) => {
    if (!activeScopeId) return false;
    const isCurrentTaskIncomingRelation = nodeId === activeScopeId && decoration.parentId === ownerTaskId;
    if (isCurrentTaskIncomingRelation) return false;
    if (ownerTaskId === activeScopeId) return true;
    if (activeAncestorIndex < 0) return false;
    const ownerAncestorIndex = decoration.ancestorTaskIds.indexOf(ownerTaskId);
    return ownerTaskId === nodeId || ownerAncestorIndex > activeAncestorIndex;
  };
  const renderSegment = (
    key: string,
    kind: GoalHierarchyGuideKind,
    guideLevel: number,
    ownerTaskId: string,
    active: boolean,
  ) => (
    <GoalHierarchyGuideSegment
      key={key}
      kind={kind}
      guideLevel={guideLevel}
      nodeLevel={level}
      ownerTaskId={ownerTaskId}
      active={active}
    />
  );

  return (
    <span
      className="goal-hierarchy-guides"
      aria-hidden="true"
      data-goal-hierarchy-guides="true"
      data-goal-hierarchy-guide-layer="row"
      data-goal-hierarchy-node-id={nodeId}
      data-goal-hierarchy-last-sibling={decoration.isLastVisibleSibling ? 'true' : 'false'}
      data-goal-hierarchy-scope-active={nodeIsInActiveScope ? 'true' : 'false'}
    >
      {decoration.ancestorContinuations.map(({ guideLevel, ownerTaskId }) => (
        renderSegment(
          `continuation-${guideLevel}-${ownerTaskId}`,
          'continuation',
          guideLevel,
          ownerTaskId,
          isRelationActive(ownerTaskId),
        )
      ))}
      {level > 0 && decoration.parentId ? (
        <>
          {renderSegment('incoming-vertical', 'incoming-vertical', level - 1, decoration.parentId, isRelationActive(decoration.parentId))}
          {renderSegment('incoming-branch', 'incoming-branch', level - 1, decoration.parentId, isRelationActive(decoration.parentId))}
        </>
      ) : null}
      {decoration.hasVisibleChildren
        ? renderSegment('child-stem', 'child-stem', level, nodeId, isRelationActive(nodeId))
        : null}
      {level === 0 && hasChildren
        ? renderSegment('root-branch', 'root-branch', level, nodeId, isRelationActive(nodeId))
        : null}
    </span>
  );
};

export default GoalHierarchyGuides;
