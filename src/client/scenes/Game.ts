import { navigateTo, showToast } from '@devvit/web/client';
import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import type { CompletedGame, LobbyState, PlayerPromptState, Role, SubmitVoteResult, VotingPlayer, VotingState } from '../../shared/api';
import { addAmbientDrift, addButtonFeedback, fadeSceneIn } from '../animations/uiAnimations';
import { trpc } from '../trpc';

export class Game extends Scene {
  private background: Phaser.GameObjects.Image | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private playerCountText: Phaser.GameObjects.Text | null = null;
  private gameIdText: Phaser.GameObjects.Text | null = null;
  private roleCard: Phaser.GameObjects.Rectangle | null = null;
  private roleGlow: Phaser.GameObjects.Ellipse | null = null;
  private roleText: Phaser.GameObjects.Text | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private promptHintText: Phaser.GameObjects.Text | null = null;
  private playersText: Phaser.GameObjects.Text | null = null;
  private playerEntries: Phaser.GameObjects.Text[] = [];
  private resultsText: Phaser.GameObjects.Text | null = null;
  private joinButton: Phaser.GameObjects.Text | null = null;
  private leaveButton: Phaser.GameObjects.Text | null = null;
  private discussionButton: Phaser.GameObjects.Text | null = null;
  private voteButtons: Phaser.GameObjects.Text[] = [];
  private refreshEvent: Phaser.Time.TimerEvent | null = null;
  private lobby: LobbyState | null = null;
  private currentRole: Role | null = null;
  private currentPrompt: PlayerPromptState | null = null;
  private votingState: VotingState | null = null;
  private displayedGameState: LobbyState['gameState'] | null = null;
  private displayedPlayerCount = -1;
  private revealedRole: Role | null = null;
  private previousPlayers = new Set<string>();
  private isJoining = false;
  private isLeaving = false;
  private isSubmittingVote = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x17151f);
    this.background = this.add.image(0, 0, 'background').setAlpha(0.24);
    addAmbientDrift(this, this.background);
    this.titleText = this.createText('Village Verdict', '42px', '#f8f2df', 'Arial Black').setStroke('#17151f', 6);
    this.statusText = this.createText('Loading village...', '24px', '#d8d1c2');
    this.playerCountText = this.createText('', '28px', '#f8f2df', 'Arial Black');
    this.gameIdText = this.createText('', '13px', '#a9a1b4');
    this.roleGlow = this.add.ellipse(0, 0, 460, 170, 0xd93900, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.roleCard = this.add.rectangle(0, 0, 620, 132, 0x2a2438, 0.94).setStrokeStyle(2, 0xd8b66d, 0.7);
    this.roleText = this.createText('', '23px', '#f8f2df').setLineSpacing(6);
    this.promptText = this.createText('', '22px', '#f8f2df').setLineSpacing(8);
    this.promptHintText = this.createText('', '19px', '#d8d1c2').setLineSpacing(8);
    this.playersText = this.createText('', '22px', '#ffffff').setLineSpacing(8);
    this.resultsText = this.createText('', '30px', '#f8f2df', 'Arial Black').setVisible(false);

    this.joinButton = this.createButton('Join Game', '26px', '#d93900', () => this.joinLobby());
    this.leaveButton = this.createButton('Leave Game', '22px', '#6b4052', () => this.leaveLobby());
    this.discussionButton = this.createButton('Open Discussion', '22px', '#3b324b', () => this.openDiscussion());

    this.updateLayout(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => this.updateLayout(gameSize.width, gameSize.height));
    this.refreshEvent = this.time.addEvent({ delay: 3000, loop: true, callback: () => void this.loadLobby() });
    fadeSceneIn(this);
    void this.loadLobby();
  }

  shutdown(): void {
    this.refreshEvent?.remove(false);
  }

  private createText(text: string, fontSize: string, color: string, fontFamily = 'Arial'): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, { fontFamily, fontSize, color, align: 'center', wordWrap: { width: 720 } })
      .setOrigin(0.5);
  }

  private createButton(label: string, fontSize: string, backgroundColor: string, onPress: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(0, 0, label, { fontFamily: 'Arial Black', fontSize, color: '#ffffff', backgroundColor, padding: { x: 22, y: 12 } })
      .setOrigin(0.5);
    addButtonFeedback(this, button, () => onPress(), () => this.getScaleFactor());
    return button;
  }

  private async loadLobby(): Promise<void> {
    try {
      this.lobby = await trpc.lobby.get.query();
      if (this.lobby.completedGame) {
        this.startGameOver(this.lobby.completedGame);
        return;
      }
      const [currentRole, votingState, currentPrompt] = await Promise.all([trpc.role.current.query(), trpc.voting.getVotingState.query(), trpc.prompt.current.query()]);
      this.currentRole = currentRole.role;
      this.votingState = votingState;
      this.renderPromptState(currentPrompt.prompt);
      if (this.currentRole && this.lobby.gameState !== votingState.gameState) {
        this.lobby = await trpc.lobby.get.query();
      }
      this.renderLobby();
    } catch (error) {
      console.error('Failed to load lobby:', error);
      this.statusText?.setText('Could not load the village yet.');
    }
  }

  private async joinLobby(): Promise<void> {
    if (this.isJoining) return;
    this.isJoining = true;
    this.joinButton?.setText('Joining...');
    try {
      const result = await trpc.lobby.join.mutate();
      this.lobby = result.lobby;
      this.votingState = await trpc.voting.getVotingState.query();
      this.currentPrompt = (await trpc.prompt.current.query()).prompt;
      this.renderLobby();
      showToast(result.joined ? 'You joined the village.' : result.reason === 'full' ? 'The village is full.' : result.reason === 'started' ? 'This verdict is already underway.' : 'You are already in the village.');
    } catch (error) {
      console.error('Failed to join lobby:', error);
      showToast('Could not join the game. Please try again.');
    } finally {
      this.isJoining = false;
      this.renderLobby();
    }
  }

  private async leaveLobby(): Promise<void> {
    if (this.isLeaving) return;
    this.isLeaving = true;
    this.leaveButton?.setText('Leaving...');
    try {
      const result = await trpc.lobby.leave.mutate();
      this.lobby = result.lobby;
      this.votingState = await trpc.voting.getVotingState.query();
      this.renderPromptState((await trpc.prompt.current.query()).prompt);
      showToast(result.left ? 'You left the village.' : result.reason === 'started' ? 'The game has already started.' : 'You are not in this village.');
    } catch (error) {
      console.error('Failed to leave lobby:', error);
      showToast('Could not leave the game. Please try again.');
    } finally {
      this.isLeaving = false;
      this.renderLobby();
    }
  }

  private async submitVote(targetPlayer: string): Promise<void> {
    if (this.isSubmittingVote || this.votingState?.selectedTarget) return;
    this.isSubmittingVote = true;
    this.renderLobby();
    try {
      const result = await trpc.voting.submitVote.mutate(targetPlayer);
      this.votingState = result.votingState;
      showToast(result.accepted ? `Vote submitted for u/${targetPlayer}.` : this.getVoteRejectionMessage(result));
    } catch (error) {
      console.error('Failed to submit vote:', error);
      showToast('Could not submit your vote. Please try again.');
    } finally {
      this.isSubmittingVote = false;
      this.renderLobby();
    }
  }

  private renderLobby(skipTransition = false): void {
    if (!this.lobby) return;
    const nextState = this.lobby.gameState;
    if (!skipTransition && this.displayedGameState && this.displayedGameState !== nextState) {
      if (this.displayedGameState === 'VOTING' && nextState === 'RESULTS') {
        this.playResultsReveal();
        return;
      }
      this.cameras.main.fadeOut(160, 23, 21, 31);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.renderLobby(true);
        this.cameras.main.fadeIn(180, 23, 21, 31);
      });
      return;
    }
    this.displayedGameState = nextState;
    const { players, gameState, minPlayers, maxPlayers, currentUsername, hasJoined } = this.lobby;
    const isFull = players.length >= maxPlayers;
    const waitingMessage = gameState === 'WAITING' ? `Need ${Math.max(minPlayers - players.length, 0)} more to ready up` : 'Ready threshold reached';
    this.statusText?.setText(`State: ${gameState}\n${waitingMessage}\nYou are u/${currentUsername}`);
    this.gameIdText?.setText(`Game ID: ${this.lobby.gameId}`);
    this.updatePlayerCount(players.length, maxPlayers);
    const isDiscussionPhase = gameState === 'IN_PROGRESS' && hasJoined && this.lobby.prompt !== null;
    this.roleText?.setText(this.getRoleMessage(gameState, hasJoined));
    this.promptText?.setText(isDiscussionPhase ? this.getPromptMessage() : '').setVisible(isDiscussionPhase);
    this.promptHintText?.setText(isDiscussionPhase ? 'Describe your word without saying it directly.' : '').setVisible(isDiscussionPhase);
    this.discussionButton?.setVisible(isDiscussionPhase);
    this.playersText?.setVisible(!isDiscussionPhase);
    if (this.isVotingVisible()) {
      this.clearPlayerEntries();
      this.playersText?.setText(this.getVotingSummary());
    } else {
      this.renderPlayerList(players);
    }
    const canLeave = hasJoined && (gameState === 'WAITING' || gameState === 'READY');
    this.joinButton?.setText(isFull ? 'Game Full' : 'Join Game').setVisible(!hasJoined).setAlpha(isFull ? 0.72 : 1);
    this.leaveButton?.setText('Leave Game').setVisible(canLeave).setAlpha(canLeave ? 1 : 0);
    this.renderVotingControls();
    if (gameState === 'VOTING') this.playVotingEntrance();
    if (this.currentRole && this.currentRole !== this.revealedRole && hasJoined) this.playRoleReveal();
  }

  private updatePlayerCount(count: number, maxPlayers: number): void {
    this.playerCountText?.setText(`${count} / ${maxPlayers} players joined`);
    if (count !== this.displayedPlayerCount && this.playerCountText) {
      this.displayedPlayerCount = count;
      this.tweens.killTweensOf(this.playerCountText);
      this.playerCountText.setScale(this.getScaleFactor() * 0.82).setAlpha(0.5);
      this.tweens.add({ targets: this.playerCountText, scaleX: this.getScaleFactor(), scaleY: this.getScaleFactor(), alpha: 1, duration: 260, ease: 'Back.Out' });
    }
  }

  private renderPlayerList(players: LobbyState['players']): void {
    this.clearPlayerEntries();
    if (players.length === 0) {
      this.playersText?.setText('No villagers have joined yet.');
      return;
    }
    this.playersText?.setText('');
    const newPlayers = new Set(players.map((player) => player.username));
    const startY = this.scale.height * 0.48;
    const gap = 34 * this.getScaleFactor();
    players.forEach((player, index) => {
      const entry = this.createText(`${index + 1}. u/${player.username}`, '22px', '#ffffff').setPosition(this.scale.width / 2, startY + index * gap).setScale(this.getScaleFactor());
      this.playerEntries.push(entry);
      if (!this.previousPlayers.has(player.username)) {
        entry.setAlpha(0).setY(entry.y + 16);
        this.tweens.add({ targets: entry, y: entry.y - 16, alpha: 1, duration: 260, delay: index * 35, ease: 'Cubic.Out' });
      }
    });
    this.previousPlayers = newPlayers;
  }

  private clearPlayerEntries(): void {
    this.playerEntries.forEach((entry) => entry.destroy());
    this.playerEntries = [];
  }

  private playRoleReveal(): void {
    if (!this.roleCard || !this.roleGlow || !this.roleText || !this.currentRole) return;
    this.revealedRole = this.currentRole;
    const scale = this.getScaleFactor();
    this.roleGlow.setAlpha(0).setScale(0.55 * scale);
    this.roleCard.setAlpha(0).setScale(0.08 * scale, scale);
    this.roleText.setAlpha(0).setScale(0.7 * scale);
    this.tweens.add({ targets: this.roleGlow, alpha: 0.56, scaleX: 1.15 * scale, scaleY: 1.15 * scale, duration: 380, ease: 'Sine.Out', yoyo: true, hold: 260 });
    this.tweens.add({ targets: this.roleCard, alpha: 1, scaleX: scale, scaleY: scale, duration: 420, ease: 'Back.Out' });
    this.tweens.add({ targets: this.roleText, alpha: 1, scaleX: scale, scaleY: scale, duration: 280, delay: 170, ease: 'Cubic.Out' });
  }

  private playVotingEntrance(): void {
    this.voteButtons.forEach((button, index) => {
      button.setAlpha(0).setY(button.y + 14);
      this.tweens.add({ targets: button, y: button.y - 14, alpha: 1, duration: 220, delay: index * 45, ease: 'Cubic.Out' });
    });
  }

  private playResultsReveal(): void {
    this.voteButtons.forEach((button) => this.tweens.add({ targets: button, alpha: 0, x: button.x - 20, duration: 180, ease: 'Cubic.In' }));
    this.time.delayedCall(210, () => {
      this.renderLobby(true);
      const eliminatedUsername = this.votingState?.eliminatedUsername;
      const eliminatedRole = this.votingState?.eliminatedRole;
      if (!this.resultsText) return;
      this.resultsText.setText(eliminatedUsername ? `u/${eliminatedUsername} was eliminated` : 'No player was eliminated.').setVisible(true).setAlpha(0).setScale(0.7 * this.getScaleFactor());
      this.cameras.main.shake(260, 0.008);
      this.tweens.add({ targets: this.resultsText, alpha: 1, scaleX: this.getScaleFactor(), scaleY: this.getScaleFactor(), duration: 360, ease: 'Back.Out' });
      if (eliminatedUsername && eliminatedRole) {
        this.time.delayedCall(1000, () => {
          this.resultsText?.setText(`u/${eliminatedUsername} was ${eliminatedRole === 'IMPOSTOR' ? 'the Impostor' : 'a Villager'}`);
          this.tweens.add({ targets: this.resultsText, alpha: { from: 0, to: 1 }, scaleX: { from: 0.8 * this.getScaleFactor(), to: this.getScaleFactor() }, scaleY: { from: 0.8 * this.getScaleFactor(), to: this.getScaleFactor() }, duration: 360, ease: 'Back.Out' });
        });
      }
    });
  }

  private startGameOver(completedGame: CompletedGame): void {
    this.refreshEvent?.remove(false);
    this.cameras.main.fadeOut(180, 23, 21, 31);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameOver', { completedGame });
    });
  }

  private getRoleMessage(gameState: LobbyState['gameState'], hasJoined: boolean): string {
    if (!hasJoined) return 'Join the village to receive a secret role when the game begins.';
    if (gameState !== 'IN_PROGRESS' && gameState !== 'VOTING' && gameState !== 'RESULTS') return 'Your secret role will appear when the game begins.';
    if (this.currentRole === 'IMPOSTOR') return 'You are the Impostor. Blend in naturally.';
    if (this.currentRole === 'VILLAGER') return 'You are a Villager. Watch how others behave.';
    return 'Your secret role is being prepared.';
  }

  private renderPromptState(prompt: PlayerPromptState | null): void {
    this.currentPrompt = prompt;
    if (!this.lobby || this.lobby.gameState !== 'IN_PROGRESS' || !this.lobby.hasJoined) return;
    if (!prompt) {
      this.promptText?.setText('').setVisible(false);
      this.promptHintText?.setText('').setVisible(false);
      return;
    }
    this.promptText?.setText(`Your Secret Word\n\n${prompt.secretWord}`).setVisible(true);
    this.promptHintText?.setText('Describe your word without saying it directly.').setVisible(true);
  }

  private getPromptMessage(): string {
    if (!this.currentPrompt) return '';
    return `Your Secret Word\n\n${this.currentPrompt.secretWord}`;
  }

  private openDiscussion(): void {
    if (this.lobby) navigateTo(`https://reddit.com/comments/${this.lobby.postId.replace('t3_', '')}`);
  }

  private renderVotingControls(): void {
    this.clearVoteButtons();
    if (!this.votingState || this.votingState.gameState !== 'VOTING') return;
    const scale = this.getScaleFactor();
    const startY = this.scale.height * 0.57;
    this.votingState.alivePlayers.forEach((player, index) => {
      const isSelected = this.votingState?.selectedTarget === player.username;
      const isDisabled = player.isCurrentUser || !this.votingState?.canVote || this.isSubmittingVote || this.votingState.selectedTarget !== null;
      const button = this.add.text(this.scale.width / 2, startY + index * 42 * scale, this.getVoteButtonLabel(player), { fontFamily: 'Arial Black', fontSize: '20px', color: player.isCurrentUser ? '#d8d1c2' : '#ffffff', backgroundColor: isSelected ? '#2e7d32' : '#3b324b', padding: { x: 18, y: 8 } }).setOrigin(0.5).setScale(scale).setAlpha(isDisabled && !isSelected ? 0.58 : 1);
      if (!isDisabled) addButtonFeedback(this, button, () => void this.submitVote(player.username), () => this.getScaleFactor());
      if (isSelected) this.tweens.add({ targets: button, scaleX: scale * 1.05, scaleY: scale * 1.05, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.voteButtons.push(button);
    });
  }

  private clearVoteButtons(): void {
    this.voteButtons.forEach((button) => button.destroy());
    this.voteButtons = [];
  }

  private isVotingVisible(): boolean {
    return this.votingState?.gameState === 'VOTING' || this.votingState?.gameState === 'RESULTS';
  }

  private getVotingSummary(): string {
    if (!this.votingState) return '';
    if (this.votingState.gameState === 'RESULTS') return '';
    const selectedVote = this.votingState.selectedTarget ? `Selected vote: u/${this.votingState.selectedTarget}` : 'Select one alive player.';
    const timerText = this.votingState.votingEndsAt ? `Voting ends ${this.formatCountdown(this.votingState.votingEndsAt)}` : 'Voting is open.';
    return `Voting phase\n${timerText}\n${selectedVote}`;
  }

  private getVoteButtonLabel(player: VotingPlayer): string {
    if (player.isCurrentUser) return `u/${player.username} (you)`;
    return this.votingState?.selectedTarget === player.username ? `u/${player.username} - selected` : `u/${player.username}`;
  }

  private getVoteRejectionMessage(result: SubmitVoteResult): string {
    if (result.reason === 'already_submitted') return 'That vote is already selected.';
    if (result.reason === 'self_vote') return 'You cannot vote for yourself.';
    if (result.reason === 'target_not_alive') return 'That player is not alive.';
    if (result.reason === 'not_alive') return 'Eliminated players cannot vote.';
    if (result.reason === 'not_joined') return 'Join the village before voting.';
    return 'Voting is not open right now.';
  }

  private formatCountdown(endsAt: string): string {
    return `in ${Math.ceil(Math.max(new Date(endsAt).getTime() - Date.now(), 0) / 1000)}s`;
  }

  private getScaleFactor(): number {
    return Math.min(Math.min(this.scale.width / 1024, this.scale.height / 768), 1);
  }

  private updateLayout(width: number, height: number): void {
    this.cameras.resize(width, height);
    const scale = this.getScaleFactor();
    const contentWidth = Math.min(width * 0.86, 720);
    if (this.background && this.background.width > 0 && this.background.height > 0) {
      this.background.setPosition(width / 2, height / 2).setScale(Math.max(width / this.background.width, height / this.background.height));
    }
    this.titleText?.setPosition(width / 2, height * 0.14).setScale(scale);
    this.statusText?.setPosition(width / 2, height * 0.25).setScale(scale);
    this.playerCountText?.setPosition(width / 2, height * 0.32).setScale(scale);
    this.gameIdText?.setPosition(width / 2, height * 0.965).setScale(scale);
    this.roleGlow?.setPosition(width / 2, height * 0.42).setScale(scale);
    this.roleCard?.setPosition(width / 2, height * 0.42).setScale(scale);
    this.roleText?.setPosition(width / 2, height * 0.42).setScale(scale).setWordWrapWidth(contentWidth);
    this.promptText?.setPosition(width / 2, height * 0.50).setScale(scale).setWordWrapWidth(contentWidth);
    this.promptHintText?.setPosition(width / 2, height * 0.66).setScale(scale).setWordWrapWidth(contentWidth);
    this.playersText?.setPosition(width / 2, height * 0.51).setScale(scale).setWordWrapWidth(contentWidth);
    this.resultsText?.setPosition(width / 2, height * 0.57).setScale(scale).setWordWrapWidth(contentWidth);
    this.discussionButton?.setPosition(width / 2, height * 0.79).setScale(scale);
    this.joinButton?.setPosition(width / 2, height * 0.84).setScale(scale);
    this.leaveButton?.setPosition(width / 2, height * 0.84).setScale(scale);
    if (this.lobby) this.renderLobby(true);
  }
}
