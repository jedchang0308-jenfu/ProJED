import React from 'react';
import {
  relationshipColorOptions,
  relationshipDashOptions,
  relationshipWidthOptions,
  type MindMapRelationshipPath,
  type MindMapRelationshipStyle,
} from './mindMapGeometry';
import MindMapRelationshipStyleDrawer from './MindMapRelationshipStyleDrawer';

interface MindMapRelationshipStyleLayerProps {
  relationshipPaths: MindMapRelationshipPath[];
  selectedRelationshipId: string | null;
  editingRelationshipId: string | null;
  onUpdateStyle: (relationshipId: string, patch: MindMapRelationshipStyle) => void;
  onResetStyle: (relationshipId: string) => void;
}

const MindMapRelationshipStyleLayer: React.FC<MindMapRelationshipStyleLayerProps> = ({
  relationshipPaths,
  selectedRelationshipId,
  editingRelationshipId,
  onUpdateStyle,
  onResetStyle,
}) => (
  <>
    {relationshipPaths.map(path => (
      selectedRelationshipId === path.id && editingRelationshipId !== path.id ? (
        <MindMapRelationshipStyleDrawer
          key={`relationship-style-${path.id}`}
          path={path}
          colorOptions={relationshipColorOptions}
          widthOptions={relationshipWidthOptions}
          dashOptions={relationshipDashOptions}
          onUpdateStyle={onUpdateStyle}
          onResetStyle={onResetStyle}
        />
      ) : null
    ))}
  </>
);

export default MindMapRelationshipStyleLayer;
