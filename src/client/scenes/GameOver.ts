import { showToast } from '@devvit/web/client';
import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import type { CompletedGame } from '../../shared/api';
import { addButtonFeedback, fadeSceneIn } from '../animations/uiAnimations';
import { trpc } from '../trpc';

type GameOverData = { completedGame?: CompletedGame };

export class GameOver extends Scene {
  private background: Phaser.GameObjects.Image | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private summaryText: Phaser.GameObjects.Text | null = null;
  private playAgainButton: Phaser.GameObjects.Text | null = null;
  private completedGame: CompletedGame | null = null;
  private isJoining = false;

  constructor() {
    super('GameOver');
  }

  init(data: GameOverData): void {
    this.completedGame = data.completedGame ?? null;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x17151f);
    this.background = this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.38);
    this.titleText = this.add.text(0, 0, 'Game Over', { fontFamily: 'Arial Black', fontSize: '58px', color: '#f8f2df', stroke: '#17151f', strokeThickness: 8 }).setOrigin(0.5);
    this.summaryText = this.add.text(0, 0, this.getSummary(), { fontFamily: 'Arial', fontSize: '27px', color: '#f8f2df', align: 'center', lineSpacing: 12, wordWrap: { width: 720 } }).setOrigin(0.5);
    this.playAgainButton = this.add.text(0, 0, 'Play Again', { fontFamily: 'Arial Black', fontSize: '26px', color: '#ffffff', backgroundColor: '#d93900', padding: { x: 24, y: 12 } }).setOrigin(0.5);
    addButtonFeedback(this, this.playAgainButton, () => void this.playAgain(), () => this.getScaleFactor());
    this.updateLayout(this.scale.width, this.scale.height);
    this.scale.on('resize', (size: Phaser.Structs.Size) => this.updateLayout(size.width, size.height));
    fadeSceneIn(this);
  }

  private async playAgain(): Promise<void> {
    if (this.isJoining) return;
    this.isJoining = true;
    this.playAgainButton?.setText('Joining...');
    try {
      const result = await trpc.lobby.playAgain.mutate();
      if (result.joined || result.reason === 'already_joined') {
        this.scene.start('Game');
        return;
      }
      showToast(result.reason === 'full' ? 'The new village is full.' : 'The new game has already started.');
    } catch (error) {
      console.error('Failed to join new game:', error);
      showToast('Could not join the new game. Please try again.');
    } finally {
      this.isJoining = false;
      this.playAgainButton?.setText('Play Again');
    }
  }

  private getSummary(): string {
    if (!this.completedGame) return 'The game has finished.';
    const eliminated = this.completedGame.eliminatedUsername ? `Eliminated player: u/${this.completedGame.eliminatedUsername}` : 'No player was eliminated.';
    const role = this.completedGame.eliminatedRole ? `Role: ${this.completedGame.eliminatedRole === 'IMPOSTOR' ? 'Impostor' : 'Villager'}` : 'Role: not revealed';
    const winner = this.completedGame.winningSide === 'VILLAGERS' ? 'Villagers win!' : 'Impostor wins!';
    return `${eliminated}\n${role}\n\n${winner}\n\nGame ID: ${this.completedGame.gameId}`;
  }

  private getScaleFactor(): number {
    return Math.min(Math.min(this.scale.width / 1024, this.scale.height / 768), 1);
  }

  private updateLayout(width: number, height: number): void {
    this.cameras.resize(width, height);
    const scale = this.getScaleFactor();
    this.background?.setDisplaySize(width, height);
    this.titleText?.setPosition(width / 2, height * 0.26).setScale(scale);
    this.summaryText?.setPosition(width / 2, height * 0.52).setScale(scale).setWordWrapWidth(Math.min(width * 0.82, 720));
    this.playAgainButton?.setPosition(width / 2, height * 0.79).setScale(scale);
  }
}
