module.exports = function(bot, state) {
    
    function createC4Board() {
        let board = [];
        for (let r = 0; r < 6; r++) {
            let row = [];
            for (let c = 0; c < 7; c++) row.push(0);
            board.push(row);
        }
        return board;
    }

    function checkC4Win(board, player) {
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] == player && board[r][c+1] == player && board[r][c+2] == player && board[r][c+3] == player) {
                    return [[r,c], [r,c+1], [r,c+2], [r,c+3]];
                }
            }
        }
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 7; c++) {
                if (board[r][c] == player && board[r+1][c] == player && board[r+2][c] == player && board[r+3][c] == player) {
                    return [[r,c], [r+1,c], [r+2,c], [r+3,c]];
                }
            }
        }
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] == player && board[r+1][c+1] == player && board[r+2][c+2] == player && board[r+3][c+3] == player) {
                    return [[r,c], [r+1,c+1], [r+2,c+2], [r+3,c+3]];
                }
            }
        }
        for (let r = 3; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                if (board[r][c] == player && board[r-1][c+1] == player && board[r-2][c+2] == player && board[r-3][c+3] == player) {
                    return [[r,c], [r-1,c+1], [r-2,c+2], [r-3,c+3]];
                }
            }
        }
        return false;
    }

    function renderC4Message(game) {
        if (game.status === 'waiting') {
            return {
                text: `🎮 <b>CONNECT 4</b>\n\n<b>${game.p1.name}</b> is waiting for an opponent...`,
                kb: [[{text: "⚔️ Join Game", callback_data: `C4_JOIN_${game.id}`}]]
            };
        }

        const emojis = { 0: '⚪', 1: '🔴', 2: '🟡', 3: '💎' };
        let boardText = `🎮 <b>CONNECT 4</b>\n🔴 <b>${game.p1.name}</b> vs 🟡 <b>${game.p2.name}</b>\n\n`;
        let kb = [];
        
        for (let r = 0; r < 6; r++) {
            let row = [];
            for (let c = 0; c < 7; c++) {
                let cbData = game.status === 'playing' ? `C4_DROP_${game.id}_${c}` : `IGNORE`;
                row.push({ text: emojis[game.board[r][c]], callback_data: cbData });
            }
            kb.push(row);
        }

        if (game.status === 'playing') {
            let currentPlayerName = game.turn === 1 ? game.p1.name : game.p2.name;
            let currentEmoji = game.turn === 1 ? '🔴' : '🟡';
            boardText += `<i>${currentEmoji} ${currentPlayerName}'s turn! Tap any column to drop your piece.</i>`;
            kb.push([{text: "🛑 Forfeit / Cancel", callback_data: `C4_LEAVE_${game.id}`}]);
        } else if (game.status === 'won') {
            let winnerName = game.winner === 1 ? game.p1.name : game.p2.name;
            let winnerEmoji = game.winner === 1 ? '🔴' : '🟡';
            boardText += `🏆 <b>${winnerEmoji} ${winnerName} WINS!</b>`;
        } else if (game.status === 'draw') {
            boardText += `🤝 <b>IT'S A DRAW!</b> The board is full.`;
        } else if (game.status === 'forfeit') {
            boardText += `🛑 <b>Game was Cancelled/Forfeited.</b>`;
        }
        
        return { text: boardText, kb: kb };
    }

    return { createC4Board, checkC4Win, renderC4Message };
};