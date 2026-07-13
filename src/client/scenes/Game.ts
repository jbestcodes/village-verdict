import { showToast } from '@devvit/web/client';
import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import type { LobbyState, Role, SubmitVoteResult, VotingPlayer, VotingState } from '../../shared/api';
import { trpc } from '../trpc';

export class Game extends Scene {
  private background: Phaser.GameObjects.Image | null = null;
  private titleText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  private roleText: Phaser.GameObjects.Text | null = null;
  private playersText: Phaser.GameObjects.Text | null = null;
  private joinButton: Phaser.GameObjects.Text | null = null;
  private voteButtons: Phaser.GameObjects.Text[] = [];
  private refreshEvent: Phaser.Time.TimerEvent | null = null;
  private lobby: LobbyState | null = null;
  private currentRole: Role | null = null;
  private votingState: VotingState | null = null;
  private isJoining = false;
  private isSubmittingVote = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x17151f);
    this.background = this.add.image(0, 0, 'background').setAlpha(0.24);

    this.titleText = this.add
      .text(0, 0, 'Village Verdict', {
        fontFamily: 'Arial Black',
        fontSize: '42px',
        color: '#f8f2df',
        stroke: '#17151f',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(0, 0, 'Loading village...', {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#d8d1c2',
        align: 'center',
      })
      .setOrigin(0.5);

    this.playersText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: 720 },
      })
      .setOrigin(0.5, 0);

    this.roleText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '23px',
        color: '#f8f2df',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: 720 },
      })
      .setOrigin(0.5);

    this.joinButton = this.add
      .text(0, 0, 'Join Game', {
        fontFamily: 'Arial Black',
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#d93900',
        padding: { x: 22, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        void this.joinLobby();
      });

    this.updateLayout(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.updateLayout(gameSize.width, gameSize.height);
    });

    this.refreshEvent = this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        void this.loadLobby();
      },
    });

    void this.loadLobby();
  }

  shutdown(): void {
    this.refreshEvent?.remove(false);
  }

  private async loadLobby(): Promise<void> {
    try {
      this.lobby = await trpc.lobby.get.query();
      const [currentRole, votingState] = await Promise.all([trpc.role.current.query(), trpc.voting.getVotingState.query()]);
      this.currentRole = currentRole.role;
      this.votingState = votingState;

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
    if (this.isJoining) {
      return;
    }

    this.isJoining = true;
    this.joinButton?.setText('Joining...');

    try {
      const result = await trpc.lobby.join.mutate();
      this.lobby = result.lobby;
      this.votingState = await trpc.voting.getVotingState.query();
      this.renderLobby();

      if (result.joined) {
        showToast('You joined the village.');
      } else if (result.reason === 'full') {
        showToast('The village is full.');
      } else if (result.reason === 'started') {
        showToast('This verdict is already underway.');
      } else {
        showToast('You are already in the village.');
      }
    } catch (error) {
      console.error('Failed to join lobby:', error);
      showToast('Could not join the game. Please try again.');
    } finally {
      this.isJoining = false;
      this.renderLobby();
    }
  }

  private async submitVote(targetPlayer: string): Promise<void> {
    if (this.isSubmittingVote || this.votingState?.selectedTarget === targetPlayer) {
      if (this.votingState?.selectedTarget === targetPlayer) {
        showToast(`Your vote is already on u/${targetPlayer}.`);
      }

      return;
    }

    this.isSubmittingVote = true;
    this.renderLobby();

    try {
      const result = await trpc.voting.submitVote.mutate(targetPlayer);
      this.votingState = result.votingState;

      if (result.accepted) {
        showToast(`Vote submitted for u/${targetPlayer}.`);
      } else {
        showToast(this.getVoteRejectionMessage(result));
      }
    } catch (error) {
      console.error('Failed to submit vote:', error);
      showToast('Could not submit your vote. Please try again.');
    } finally {
      this.isSubmittingVote = false;
      this.renderLobby();
    }
  }

  private renderLobby(): void {
    if (!this.lobby) {
      return;
    }

    const { players, gameState, minPlayers, maxPlayers, currentUsername, hasJoined } = this.lobby;
    const isFull = players.length >= maxPlayers;
    const waitingMessage =
      gameState === 'WAITING' ? `Need ${Math.max(minPlayers - players.length, 0)} more to ready up` : 'Ready threshold reached';
    const playerLines =
      this.votingState && this.isVotingVisible()
        ? this.getVotingSummary()
        : players.length > 0
        ? players.map((player, index) => `${index + 1}. u/${player.username}`).join('\n')
        : 'No villagers have joined yet.';
    const roleMessage = this.getRoleMessage(gameState, hasJoined);

    this.statusText?.setText(
      `State: ${gameState}\n${players.length} / ${maxPlayers} players joined\n${waitingMessage}\nYou are u/${currentUsername}`
    );
    this.roleText?.setText(roleMessage);
    this.playersText?.setText(playerLines);
    this.joinButton?.setText(hasJoined ? 'Joined' : isFull ? 'Game Full' : 'Join Game');
    this.joinButton?.setAlpha(hasJoined || isFull ? 0.72 : 1);
    this.renderVotingControls();
  }

  private getRoleMessage(gameState: LobbyState['gameState'], hasJoined: boolean): string {
    if (!hasJoined) {
      return 'Join the village to receive a secret role when the game begins.';
    }

    if (gameState !== 'IN_PROGRESS' && gameState !== 'VOTING' && gameState !== 'RESULTS') {
      return 'Your secret role will appear when the game begins.';
    }

    if (this.currentRole === 'IMPOSTOR') {
      return 'You are the Impostor.\nBlend in and avoid being discovered.';
    }

    if (this.currentRole === 'VILLAGER') {
      return 'You are a Villager.\nFind the impostor by watching for suspicious answers.';
    }

    return 'Your secret role is being prepared.';
  }

  private renderVotingControls(): void {
    this.clearVoteButtons();

    if (!this.votingState || !this.isVotingVisible()) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const scaleFactor = Math.min(Math.min(width / 1024, height / 768), 1);
    const startY = height * 0.57;
    const rowGap = 42 * scaleFactor;

    this.votingState.alivePlayers.forEach((player, index) => {
      const isSelected = this.votingState?.selectedTarget === player.username;
      const isDisabled = player.isCurrentUser || !this.votingState?.canVote || this.isSubmittingVote;
      const voteButton = this.add
        .text(width / 2, startY + index * rowGap, this.getVoteButtonLabel(player), {
          fontFamily: 'Arial Black',
          fontSize: '20px',
          color: player.isCurrentUser ? '#d8d1c2' : '#ffffff',
          backgroundColor: isSelected ? '#2e7d32' : '#3b324b',
          padding: { x: 18, y: 8 },
        })
        .setOrigin(0.5)
        .setScale(scaleFactor)
        .setAlpha(isDisabled && !isSelected ? 0.58 : 1);

      if (!isDisabled) {
        voteButton.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          void this.submitVote(player.username);
        });
      }

      this.voteButtons.push(voteButton);
    });
  }

  private clearVoteButtons(): void {
    this.voteButtons.forEach((voteButton) => {
      voteButton.destroy();
    });
    this.voteButtons = [];
  }

  private isVotingVisible(): boolean {
    return this.votingState?.gameState === 'VOTING' || this.votingState?.gameState === 'RESULTS';
  }

  private getVotingSummary(): string {
    if (!this.votingState) {
      return '';
    }

    if (this.votingState.gameState === 'RESULTS') {
      return this.votingState.eliminatedUsername
        ? `Voting ended.\nu/${this.votingState.eliminatedUsername} was eliminated.`
        : 'Voting ended.\nNo player was eliminated.';
    }

    const selectedVote = this.votingState.selectedTarget ? `Selected vote: u/${this.votingState.selectedTarget}` : 'Select one alive player.';
    const timerText = this.votingState.votingEndsAt ? `Voting ends ${this.formatCountdown(this.votingState.votingEndsAt)}` : 'Voting is open.';

    return `Voting phase\n${timerText}\n${selectedVote}`;
  }

  private getVoteButtonLabel(player: VotingPlayer): string {
    if (player.isCurrentUser) {
      return `u/${player.username} (you)`;
    }

    if (this.votingState?.selectedTarget === player.username) {
      return `u/${player.username} - selected`;
    }

    return `u/${player.username}`;
  }

  private getVoteRejectionMessage(result: SubmitVoteResult): string {
    if (result.reason === 'already_submitted') {
      return 'That vote is already selected.';
    }

    if (result.reason === 'self_vote') {
      return 'You cannot vote for yourself.';
    }

    if (result.reason === 'target_not_alive') {
      return 'That player is not alive.';
    }

    if (result.reason === 'not_alive') {
      return 'Eliminated players cannot vote.';
    }

    if (result.reason === 'not_joined') {
      return 'Join the village before voting.';
    }

    return 'Voting is not open right now.';
  }

  private formatCountdown(endsAt: string): string {
    const remainingMs = Math.max(new Date(endsAt).getTime() - Date.now(), 0);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return `in ${remainingSeconds}s`;
  }

  private updateLayout(width: number, height: number): void {
    this.cameras.resize(width, height);

    if (this.background) {
      this.background.setPosition(width / 2, height / 2);
      if (this.background.width > 0 && this.background.height > 0) {
        const scale = Math.max(width / this.background.width, height / this.background.height);
        this.background.setScale(scale);
      }
    }

    const scaleFactor = Math.min(Math.min(width / 1024, height / 768), 1);
    const contentWidth = Math.min(width * 0.86, 720);

    this.titleText?.setPosition(width / 2, height * 0.14).setScale(scaleFactor);
    this.statusText?.setPosition(width / 2, height * 0.25).setScale(scaleFactor);
    this.roleText?.setPosition(width / 2, height * 0.38).setScale(scaleFactor);
    this.roleText?.setWordWrapWidth(contentWidth);
    this.playersText?.setPosition(width / 2, height * 0.48).setScale(scaleFactor);
    this.playersText?.setWordWrapWidth(contentWidth);
    this.joinButton?.setPosition(width / 2, height * 0.84).setScale(scaleFactor);
    this.renderVotingControls();
  }
}
