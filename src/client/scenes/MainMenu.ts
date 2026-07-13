import { GameObjects, Scene } from 'phaser';

export class MainMenu extends Scene {
  private background: GameObjects.Image | null = null;
  private title: GameObjects.Text | null = null;
  private subtitle: GameObjects.Text | null = null;
  private prompt: GameObjects.Text | null = null;

  constructor() {
    super('MainMenu');
  }

  init(): void {
    this.background = null;
    this.title = null;
    this.subtitle = null;
    this.prompt = null;
  }

  create(): void {
    this.refreshLayout();
    this.scale.on('resize', () => this.refreshLayout());

    this.input.once('pointerdown', () => {
      this.scene.start('Game');
    });
  }

  private refreshLayout(): void {
    const { width, height } = this.scale;
    const scaleFactor = Math.min(width / 1024, height / 768);

    this.cameras.resize(width, height);

    if (!this.background) {
      this.background = this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.34);
    }
    this.background.setDisplaySize(width, height);

    if (!this.title) {
      this.title = this.add
        .text(0, 0, 'Village Verdict', {
          fontFamily: 'Arial Black',
          fontSize: '44px',
          color: '#f8f2df',
          stroke: '#17151f',
          strokeThickness: 6,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.title.setPosition(width / 2, height * 0.38).setScale(scaleFactor);

    if (!this.subtitle) {
      this.subtitle = this.add
        .text(0, 0, 'A daily Reddit social deduction lobby', {
          fontFamily: 'Arial',
          fontSize: '24px',
          color: '#d8d1c2',
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.subtitle.setPosition(width / 2, height * 0.5).setScale(scaleFactor);

    if (!this.prompt) {
      this.prompt = this.add
        .text(0, 0, 'Tap to view the village', {
          fontFamily: 'Arial Black',
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#d93900',
          padding: { x: 18, y: 10 },
        })
        .setOrigin(0.5);
    }
    this.prompt.setPosition(width / 2, height * 0.64).setScale(scaleFactor);
  }
}
