import * as Phaser from 'phaser';

const transitionDuration = 180;

export const addButtonFeedback = (
  scene: Phaser.Scene,
  button: Phaser.GameObjects.Text,
  onPress: () => void,
  getBaseScale: () => number
): void => {
  const scaleTo = (multiplier: number, duration: number): void => {
    scene.tweens.killTweensOf(button);
    scene.tweens.add({
      targets: button,
      scaleX: getBaseScale() * multiplier,
      scaleY: getBaseScale() * multiplier,
      duration,
      ease: 'Sine.Out',
    });
  };

  button
    .setInteractive({ useHandCursor: true })
    .on('pointerover', () => scaleTo(1.05, 120))
    .on('pointerout', () => scaleTo(1, 120))
    .on('pointerdown', () => {
      scaleTo(0.94, 70);
      scene.tweens.add({
        targets: button,
        scaleX: getBaseScale(),
        scaleY: getBaseScale(),
        duration: 120,
        delay: 70,
        ease: 'Back.Out',
      });
      onPress();
    });
};

export const fadeToScene = (scene: Phaser.Scene, sceneKey: string): void => {
  scene.cameras.main.fadeOut(transitionDuration, 23, 21, 31);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    scene.scene.start(sceneKey);
  });
};

export const fadeSceneIn = (scene: Phaser.Scene): void => {
  scene.cameras.main.fadeIn(transitionDuration, 23, 21, 31);
};

export const addAmbientDrift = (scene: Phaser.Scene, object: Phaser.GameObjects.Image): void => {
  scene.tweens.add({
    targets: object,
    y: object.y - 8,
    alpha: object.alpha + 0.04,
    duration: 2600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.InOut',
  });
};
