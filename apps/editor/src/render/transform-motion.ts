import * as THREE from 'three';
import type { SceneObject } from '../contracts';
import { MOTION, type MotionTimeline } from './motion';

export function transitionTransform(timeline: MotionTimeline, root: THREE.Group, pose: THREE.Group, object: SceneObject, animate: boolean): void {
  root.updateMatrix();
  const target = new THREE.Matrix4().compose(new THREE.Vector3(...object.position),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), object.rotation), new THREE.Vector3(...object.scale));
  if (animate && target.equals(root.matrix)) return;
  timeline.sample(root);
  root.updateMatrix();
  const displayed = new THREE.Matrix4().multiplyMatrices(root.matrix, pose.matrix);
  root.position.fromArray(object.position);
  root.rotation.set(0, object.rotation, 0);
  root.scale.fromArray(object.scale);
  root.updateMatrix();
  const reset = () => { pose.matrix.identity(); pose.matrixWorldNeedsUpdate = true; };
  timeline.cancel(root);
  if (!animate || timeline.reduced || displayed.equals(root.matrix)) { reset(); return; }
  const fromPosition = new THREE.Vector3(), fromRotation = new THREE.Quaternion(), fromScale = new THREE.Vector3();
  displayed.decompose(fromPosition, fromRotation, fromScale);
  const toPosition = root.position.clone(), toRotation = root.quaternion.clone(), toScale = root.scale.clone();
  const inverse = root.matrix.clone().invert();
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), matrix = new THREE.Matrix4();
  timeline.animate(root, MOTION.transform, t => {
    if (t === 1) { reset(); return; }
    position.lerpVectors(fromPosition, toPosition, t);
    rotation.slerpQuaternions(fromRotation, toRotation, t);
    scale.lerpVectors(fromScale, toScale, t);
    // A matrix offset preserves world rotation with nonuniform scales, without
    // decomposing the potentially sheared inverse-parent transform.
    matrix.compose(position, rotation, scale);
    pose.matrix.multiplyMatrices(inverse, matrix);
    pose.matrixWorldNeedsUpdate = true;
  });
}
