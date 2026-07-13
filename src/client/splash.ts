import { requestExpandedMode, showToast } from '@devvit/web/client';
import { trpc } from './trpc';

const startButton = document.getElementById('start-button');

if (!(startButton instanceof HTMLButtonElement)) {
  throw new Error('Join Game button was not found');
}

startButton.addEventListener('click', (event) => {
  void joinAndOpenGame(event);
});

const joinAndOpenGame = async (event: MouseEvent): Promise<void> => {
  startButton.disabled = true;
  startButton.textContent = 'Joining...';

  try {
    const result = await trpc.lobby.join.mutate();
    showToast(result.joined ? 'You joined the village.' : 'You are already in the village.');
    requestExpandedMode(event, 'game');
  } catch (error) {
    console.error('Failed to join lobby:', error);
    showToast('Could not join the game. Please try again.');
    startButton.disabled = false;
    startButton.textContent = 'Join Game';
  }
};
