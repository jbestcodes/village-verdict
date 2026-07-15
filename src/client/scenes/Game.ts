import { navigateTo, showToast } from '@devvit/web/client';
import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import type { CompletedGame, LobbyState, PlayerSecretWord, SubmitVoteResult, VotingState } from '../../shared/api';
import { addButtonFeedback, fadeSceneIn } from '../animations/uiAnimations';
import { trpc } from '../trpc';

export class Game extends Scene {
  private title: Phaser.GameObjects.Text | null = null;
  private message: Phaser.GameObjects.Text | null = null;
  private detail: Phaser.GameObjects.Text | null = null;
  private primaryButton: Phaser.GameObjects.Text | null = null;
  private secondaryButton: Phaser.GameObjects.Text | null = null;
  private voteButtons: Phaser.GameObjects.Text[] = [];
  private refreshEvent: Phaser.Time.TimerEvent | null = null;
  private tickEvent: Phaser.Time.TimerEvent | null = null;
  private lobby: LobbyState | null = null;
  private prompt: PlayerSecretWord | null = null;
  private voting: VotingState | null = null;
  private isSubmittingVote = false;

  constructor() { super('Game'); }

  create(): void {
    this.cameras.main.setBackgroundColor(0x17151f);
    this.add.image(0, 0, 'background').setOrigin(0).setAlpha(0.24).setDisplaySize(this.scale.width, this.scale.height);
    this.title = this.text('Village Verdict', '42px', '#f8f2df', 'Arial Black');
    this.message = this.text('', '28px', '#f8f2df', 'Arial Black');
    this.detail = this.text('', '21px', '#d8d1c2');
    this.primaryButton = this.button('', '#d93900', () => void this.handlePrimary());
    this.secondaryButton = this.button('', '#3b324b', () => void this.handleSecondary());
    this.scale.on('resize', (size: Phaser.Structs.Size) => this.layout(size.width, size.height));
    this.refreshEvent = this.time.addEvent({ delay: 1500, loop: true, callback: () => void this.loadGameState() });
    this.tickEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.render() });
    this.layout(this.scale.width, this.scale.height);
    fadeSceneIn(this);
    void this.loadGameState();
  }

  shutdown(): void { this.refreshEvent?.remove(false); this.tickEvent?.remove(false); }

  private text(value: string, size: string, color: string, family = 'Arial'): Phaser.GameObjects.Text {
    return this.add.text(0, 0, value, { fontFamily: family, fontSize: size, color, align: 'center', wordWrap: { width: 720 } }).setOrigin(0.5);
  }

  private button(label: string, color: string, action: () => void): Phaser.GameObjects.Text {
    const button = this.add.text(0, 0, label, { fontFamily: 'Arial Black', fontSize: '23px', color: '#ffffff', backgroundColor: color, padding: { x: 28, y: 15 } }).setOrigin(0.5);
    addButtonFeedback(this, button, action, () => this.scaleFactor());
    return button;
  }

  private async loadGameState(): Promise<void> {
    try {
      const lobby = await trpc.lobby.get.query();
      if (lobby.completedGame) return this.startGameOver(lobby.completedGame);
      const [prompt, voting] = await Promise.all([trpc.prompt.current.query(), trpc.voting.getVotingState.query()]);
      const currentLobby = await trpc.lobby.get.query();
      if (currentLobby.completedGame) return this.startGameOver(currentLobby.completedGame);
      this.lobby = currentLobby;
      this.prompt = prompt.prompt;
      this.voting = voting.gameState === currentLobby.gameState ? voting : null;
      this.render();
    } catch (error) { console.error('Failed to load game:', error); }
  }

  private clearPhase(): void {
    this.voteButtons.forEach((button) => button.destroy());
    this.voteButtons = [];
    this.message?.setText('').setVisible(false);
    this.detail?.setText('').setVisible(false);
    this.primaryButton?.setVisible(false);
    this.secondaryButton?.setVisible(false);
  }

  private render(): void {
    if (!this.lobby) return;
    this.clearPhase();
    if (this.lobby.gameState === 'WAITING') return this.renderWaiting();
    if (this.lobby.gameState === 'READY') return this.renderReady();
    if (this.lobby.gameState === 'SECRET_WORD') return this.renderSecretWord();
    if (this.lobby.gameState === 'DISCUSSION') return this.renderDiscussion();
    if (this.lobby.gameState === 'VOTING') return this.renderVoting();
    if (this.lobby.gameState === 'RESULTS') return this.renderResults();
    if (this.lobby.gameState === 'PLAY_AGAIN') return this.renderPlayAgain();
  }

  private renderWaiting(): void {
    const expired = this.lobby?.waitingEndsAt !== null && this.lobby?.waitingEndsAt !== undefined && new Date(this.lobby.waitingEndsAt).getTime() <= Date.now();
    this.show('Waiting for more players...', expired ? 'No additional players joined.' : `${this.lobby?.players.length ?? 0} players joined · ${this.countdown(this.lobby?.waitingEndsAt)}`);
    if (expired) { this.showButtons('Continue Waiting', 'Leave Game'); return; }
    if (this.lobby?.hasJoined) this.showButtons('', 'Leave Game'); else this.showButtons('Join Game', '');
  }

  private renderReady(): void {
    this.show('Round Ready', 'Roles and secret words are being assigned.');
  }

  private renderSecretWord(): void {
    const word = this.lobby?.hasJoined ? this.prompt?.secretWord ?? 'Preparing your word...' : 'Join the next game to play.';
    const countdownText = this.countdown(this.lobby?.wordRevealEndsAt);
    this.show('Your Secret Word', `${word}\n\nObjective:\nDescribe this word in Reddit comments without saying it directly.\n\n${countdownText}`);
    this.showButtons('Open Discussion', '');
  }

  private renderDiscussion(): void {
    const word = this.lobby?.hasJoined ? this.prompt?.secretWord ?? 'Preparing your word...' : 'Join the next game to play.';
    this.show('Discussion Phase', `Secret word:\n${word}\n\nDiscuss in the Reddit comments.\nDiscussion ends ${this.countdown(this.lobby?.discussionEndsAt)}`);
    this.showButtons('Open Discussion', '');
  }

  private renderVoting(): void {
    const voting = this.voting;
    if (!voting) return this.show('Voting is starting...', '');
    const submitted = voting.selectedTarget !== null;
    this.show('Vote for the player you believe received the different secret word.', submitted ? 'Vote submitted.\nWaiting for other players...' : `Voting ends ${this.countdown(voting.votingEndsAt)}`);
    const candidates = voting.alivePlayers;
    candidates.forEach((player, index) => {
      const disabled = submitted || this.isSubmittingVote || !voting.canVote || player.isCurrentUser;
      const label = player.isCurrentUser ? `u/${player.username} (You)` : `u/${player.username}`;
      const button = this.button(label, submitted && voting.selectedTarget === player.username ? '#2e7d32' : '#3b324b', () => void this.submitVote(player.username));
      button.setPosition(this.scale.width / 2, this.scale.height * 0.51 + index * 62 * this.scaleFactor()).setScale(this.scaleFactor()).setAlpha(disabled ? 0.55 : 1);
      if (disabled) button.disableInteractive();
      this.voteButtons.push(button);
    });
  }

  private renderResults(): void { this.show('Results', 'Votes are being verified...'); }
  private renderPlayAgain(): void { this.show('Round Complete', 'A new round will start soon.'); }

  private show(heading: string, body: string): void {
    this.message?.setText(heading).setVisible(true);
    this.detail?.setText(body).setVisible(true);
  }

  private showButtons(primary: string, secondary: string): void {
    this.primaryButton?.setText(primary).setVisible(primary.length > 0);
    this.secondaryButton?.setText(secondary).setVisible(secondary.length > 0);
  }

  private async handlePrimary(): Promise<void> {
    if (!this.lobby) return;
    if (this.lobby.gameState === 'WAITING' && this.lobby.waitingEndsAt && new Date(this.lobby.waitingEndsAt).getTime() <= Date.now()) this.lobby = await trpc.lobby.continueWaiting.mutate();
    else if (this.lobby.gameState === 'WAITING') this.lobby = (await trpc.lobby.join.mutate()).lobby;
    else if (this.lobby.gameState === 'SECRET_WORD' || this.lobby.gameState === 'DISCUSSION') this.openDiscussion();
    this.render();
  }

  private async handleSecondary(): Promise<void> {
    if (!this.lobby || this.lobby.gameState !== 'WAITING') return;
    const result = await trpc.lobby.leave.mutate();
    this.lobby = result.lobby;
    this.render();
  }

  private async submitVote(username: string): Promise<void> {
    if (this.isSubmittingVote) return;
    this.isSubmittingVote = true;
    this.render();
    try {
      const result = await trpc.voting.submitVote.mutate(username);
      this.voting = result.votingState;
      if (!result.accepted) showToast(this.voteError(result));
    } catch (error) { console.error('Failed to submit vote:', error); showToast('Could not submit your vote.'); }
    finally { this.isSubmittingVote = false; this.render(); }
  }

  private voteError(result: SubmitVoteResult): string { return result.reason === 'already_submitted' ? 'You already voted.' : 'Voting is not available.'; }
  private openDiscussion(): void { if (this.lobby) navigateTo(`https://reddit.com/comments/${this.lobby.postId.replace('t3_', '')}`); }
  private countdown(endsAt: string | null | undefined): string { return endsAt ? `in ${Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000))}s` : 'soon'; }
  private scaleFactor(): number { return Math.max(0.72, Math.min(this.scale.width / 1024, this.scale.height / 768, 1)); }
  private layout(width: number, height: number): void {
    this.cameras.resize(width, height);
    const scale = this.scaleFactor();
    this.title?.setPosition(width / 2, height * 0.14).setScale(scale);
    this.message?.setPosition(width / 2, height * 0.34).setScale(scale).setWordWrapWidth(Math.min(width * 0.86, 720));
    this.detail?.setPosition(width / 2, height * 0.48).setScale(scale).setWordWrapWidth(Math.min(width * 0.86, 720));
    this.primaryButton?.setPosition(width / 2, height - 64).setScale(scale);
    this.secondaryButton?.setPosition(width / 2, height - 126).setScale(scale);
    this.render();
  }
  private startGameOver(completedGame: CompletedGame): void { this.refreshEvent?.remove(false); this.scene.start('GameOver', { completedGame }); }
}
