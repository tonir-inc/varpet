import * as THREE from 'three';

/** Articulate a fitted product without letting its parent's anisotropic fit stretch a turning leaf. */
export function rigidOpeningMotion(pivot: THREE.Object3D, fit: THREE.Vector3): () => void {
  const scale = new THREE.Matrix4().makeScale(Math.abs(fit.x), Math.abs(fit.y), Math.abs(fit.z));
  const inverse = scale.clone().invert();
  const rotation = new THREE.Matrix4();
  pivot.matrixAutoUpdate = false;
  return () => {
    rotation.makeRotationFromQuaternion(pivot.quaternion);
    // Fit is above the hinge: S * (S^-1 R S) = R S. Mirroring still determines handing/swing.
    pivot.matrix.makeTranslation(pivot.position.x, pivot.position.y, pivot.position.z)
      .multiply(inverse).multiply(rotation).multiply(scale);
    pivot.matrixWorldNeedsUpdate = true;
  };
}
