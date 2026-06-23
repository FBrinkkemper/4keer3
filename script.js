(function () {
  "use strict";

  var PUZZLES = window.FOUR_KEER_DRIE_PUZZLES || [];
  var TIME_ZONE = "Europe/Amsterdam";
  var STORAGE_PREFIX = "4keer3:state:v2:";
  var MAX_SELECTION = 3;
  var GROUP_COLORS = ["geel", "groen", "blauw", "paars"];
  var GROUP_SHADE_COLORS = ["#f8ebaa", "#d9eddf", "#dcecff", "#eee4ff"];
  var locked = false;

  var els = {
    app: document.getElementById("app"),
    puzzleLabel: document.getElementById("puzzleLabel"),
    foundLabel: document.getElementById("foundLabel"),
    mistakeLabel: document.getElementById("mistakeLabel"),
    solvedGroups: document.getElementById("solvedGroups"),
    tileGrid: document.getElementById("tileGrid"),
    message: document.getElementById("message"),
    shuffleButton: document.getElementById("shuffleButton"),
    deselectButton: document.getElementById("deselectButton"),
    submitButton: document.getElementById("submitButton"),
    todayButton: document.getElementById("todayButton"),
    archiveButton: document.getElementById("archiveButton"),
    resultPanel: document.getElementById("resultPanel"),
    resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"),
    scoreBreakdown: document.getElementById("scoreBreakdown"),
    shareButton: document.getElementById("shareButton"),
    archiveModal: document.getElementById("archiveModal"),
    archiveList: document.getElementById("archiveList"),
    scoringButton: document.getElementById("scoringButton"),
    scoringModal: document.getElementById("scoringModal")
  };

  validatePuzzles(PUZZLES);

  var sortedPuzzles = PUZZLES.slice().sort(function (a, b) {
    return a.date.localeCompare(b.date);
  });
  var dailyPuzzle = getDailyPuzzle();
  var currentPuzzle = getInitialPuzzle();
  var state = loadState(currentPuzzle);

  bindEvents();
  render();
  if (!isComplete()) setMessage("Kies drie woorden die bij elkaar horen.", "neutral");

  function bindEvents() {
    els.tileGrid.addEventListener("click", function (event) {
      var tile = event.target.closest("[data-word]");
      if (!tile || locked) return;
      toggleWord(tile.dataset.word);
    });
    els.message.addEventListener("click", function (event) {
      if (event.target.matches("[data-open-result]")) {
        openModal(els.resultPanel);
      }
    });

    els.shuffleButton.addEventListener("click", shuffleBoard);
    els.deselectButton.addEventListener("click", function () {
      state.selected = [];
      saveState();
      render();
      setMessage("Selectie gewist.", "neutral");
    });
    els.submitButton.addEventListener("click", submitGuess);
    els.todayButton.addEventListener("click", function () {
      switchPuzzle(dailyPuzzle.id);
    });
    els.archiveButton.addEventListener("click", function () {
      renderArchive();
      openModal(els.archiveModal);
    });
    els.scoringButton.addEventListener("click", function () {
      openModal(isComplete() ? els.resultPanel : els.scoringModal);
    });
    els.shareButton.addEventListener("click", copyShareText);

    document.addEventListener("click", function (event) {
      if (event.target.matches("[data-close-modal]")) {
        closeModals();
      }
      if (event.target.classList.contains("modal")) {
        closeModals();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeModals();
    });
  }

  function render() {
    var solvedCount = state.solvedCategoryIds.length;
    var complete = isComplete();

    els.puzzleLabel.textContent = "#" + currentPuzzle.number + " · " + formatDate(currentPuzzle.date);
    renderDots(els.foundLabel, 4, solvedCount, "progress", "Groepen:");
    renderDots(els.mistakeLabel, 3, Math.min(state.mistakes, 3), "mistake", "Fouten:");
    els.todayButton.disabled = currentPuzzle.id === dailyPuzzle.id;

    renderSolvedGroups();
    renderTiles();

    els.shuffleButton.disabled = locked || complete || getBoardWords().length < 2;
    els.deselectButton.disabled = locked || state.selected.length === 0 || complete;
    els.submitButton.disabled = locked || state.selected.length !== MAX_SELECTION || complete;

    if (complete) {
      var scoring = getScoringResult(state, currentPuzzle);
      els.resultTitle.textContent = isFailed() ? "Niet gehaald" : "Score " + scoring.score;
      els.resultText.textContent = plural(state.guesses.length, "poging", "pogingen") + " · " + plural(state.mistakes, "fout", "fouten") + " · " + formatElapsed(scoring.elapsedSeconds);
      renderScoreBreakdown(scoring);
      renderInlineScore(scoring);
    } else {
      closeModal(els.resultPanel);
      els.scoreBreakdown.innerHTML = "";
    }
  }

  function renderSolvedGroups() {
    els.solvedGroups.innerHTML = "";

    state.solvedCategoryIds.forEach(function (categoryId) {
      var category = getCategoryById(categoryId);
      if (!category) return;
      var categoryIndex = currentPuzzle.categories.findIndex(function (candidate) {
        return candidate.id === category.id;
      });

      var group = document.createElement("article");
      group.className = "solved-group solved-color-" + (categoryIndex % 4);

      var label = document.createElement("strong");
      label.textContent = category.label;
      group.appendChild(label);

      var words = document.createElement("span");
      words.className = "solved-group-words";
      words.textContent = category.words.join(" · ");
      group.appendChild(words);

      els.solvedGroups.appendChild(group);
    });
  }

  function renderDots(container, total, active, type, label) {
    container.innerHTML = "";
    if (label) {
      var labelEl = document.createElement("span");
      labelEl.className = "dot-label";
      labelEl.textContent = label;
      container.appendChild(labelEl);
    }
    for (var index = 0; index < total; index += 1) {
      var dot = document.createElement("span");
      dot.className = "status-dot";
      if (index < active) dot.classList.add(type === "mistake" ? "wrong" : "right");
      container.appendChild(dot);
    }
  }

  function renderTiles() {
    var visibleWords = getBoardWords();
    var complete = isComplete();
    els.tileGrid.innerHTML = "";
    els.tileGrid.dataset.count = String(visibleWords.length);

    visibleWords.forEach(function (word) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "tile";
      button.dataset.word = word;
      button.textContent = word;
      button.disabled = locked || complete;

      if (state.selected.indexOf(word) !== -1) button.classList.add("selected");
      var solvedInfo = getSolvedWordInfo(word);
      if (solvedInfo) {
        button.classList.add("solved-tile");
        button.setAttribute("aria-label", word + ", gevonden in " + solvedInfo.label);
        if (solvedInfo.count > 1) {
          button.classList.add("multi-solved", "multi-shade", "shade-count-" + Math.min(solvedInfo.colors.length, 4));
          solvedInfo.colors.slice(0, 4).forEach(function (colorIndex, index) {
            button.style.setProperty("--shade-" + (index + 1), GROUP_SHADE_COLORS[colorIndex]);
          });
        } else {
          button.classList.add("solved-color-" + solvedInfo.colorIndex);
        }
      }
      if (word === currentPuzzle.special && complete) {
        button.classList.add("final-word");
      }

      els.tileGrid.appendChild(button);
    });
  }

  function toggleWord(word) {
    if (isComplete()) return;
    ensureStarted();

    var selectedIndex = state.selected.indexOf(word);
    if (selectedIndex !== -1) {
      state.selected.splice(selectedIndex, 1);
    } else if (state.selected.length < MAX_SELECTION) {
      state.selected.push(word);
    } else {
      setMessage("Er zijn al drie woorden gekozen.", "warn");
      pulseSelection();
      return;
    }

    saveState();
    render();

    if (state.selected.length === MAX_SELECTION) {
      setMessage("Klaar om te versturen.", "neutral");
    } else {
      setMessage("Kies drie woorden die bij elkaar horen.", "neutral");
    }
  }

  function submitGuess() {
    if (locked || isComplete()) return;
    ensureStarted();

    if (state.selected.length !== MAX_SELECTION) {
      setMessage("Kies precies drie woorden.", "warn");
      return;
    }

    var match = findMatchingCategory(state.selected, false);
    if (match) {
      locked = true;
      animateSelected("correct");
      setMessage("Gevonden: " + match.label + ".", "success");

      window.setTimeout(function () {
        var previousPositions = getTilePositions();
        var selectedWords = state.selected.slice();
        state.guesses.push({
          words: selectedWords,
          result: "correct",
          categoryId: match.id
        });
        state.solvedCategoryIds.push(match.id);
        state.selected = [];
        state.order = getSolvedLayoutOrder(state.order, currentPuzzle, state);

        if (state.solvedCategoryIds.length === currentPuzzle.categories.length) {
          state.completedAt = new Date().toISOString();
          setMessage("Alle groepen gevonden. Het gedeelde woord is " + currentPuzzle.special + ".", "success");
        }

        locked = false;
        saveState();
        render();
        animateTileMoves(previousPositions);
      }, 280);
      return;
    }

    if (findMatchingCategory(state.selected, true)) {
      state.selected = [];
      saveState();
      render();
      setMessage("Die groep is al opgelost.", "warn");
      return;
    }

    var previousPositions = getTilePositions();
    state.mistakes += 1;
    state.guesses.push({
      words: state.selected.slice(),
      result: "wrong",
      groupsLeft: currentPuzzle.categories.length - state.solvedCategoryIds.length
    });
    state.selected = [];
    if (state.mistakes >= 3) {
      revealAllResults();
      state.completedAt = new Date().toISOString();
      setMessage("Drie fouten. Alle groepen zijn onthuld.", "error");
    } else {
      setMessage("Dat past niet. Probeer een andere combinatie.", "error");
    }
    saveState();
    render();
    if (state.mistakes >= 3) {
      animateTileMoves(previousPositions);
    } else {
      shakeWords(state.guesses[state.guesses.length - 1].words);
    }
  }

  function revealAllResults() {
    currentPuzzle.categories.forEach(function (category) {
      if (state.solvedCategoryIds.indexOf(category.id) === -1) {
        state.solvedCategoryIds.push(category.id);
      }
    });
    state.order = getSolvedLayoutOrder(state.order, currentPuzzle, state);
  }

  function shuffleBoard() {
    if (locked || isComplete()) return;
    ensureStarted();
    var previousPositions = getTilePositions();
    state.order = getSolvedLayoutOrder(shuffle(state.order.slice(), Math.random), currentPuzzle, state);
    saveState();
    render();
    animateTileMoves(previousPositions);
    setMessage("Woorden geschud.", "neutral");
  }

  function ensureStarted() {
    if (!state.startedAt) {
      state.startedAt = new Date().toISOString();
      saveState();
    }
  }

  function getTilePositions() {
    var positions = {};
    els.tileGrid.querySelectorAll("[data-word]").forEach(function (tile) {
      var rect = tile.getBoundingClientRect();
      positions[tile.dataset.word] = {
        left: rect.left,
        top: rect.top
      };
    });
    return positions;
  }

  function animateTileMoves(previousPositions) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var movingTiles = [];
    els.tileGrid.querySelectorAll("[data-word]").forEach(function (tile) {
      var previous = previousPositions[tile.dataset.word];
      if (!previous) return;
      var current = tile.getBoundingClientRect();
      var deltaX = previous.left - current.left;
      var deltaY = previous.top - current.top;
      if (!deltaX && !deltaY) return;

      tile.classList.add("moving");
      tile.style.transition = "transform 0s";
      tile.style.transform = "translate(" + deltaX + "px, " + deltaY + "px)";
      movingTiles.push(tile);
    });

    if (!movingTiles.length) return;

    window.requestAnimationFrame(function () {
      movingTiles.forEach(function (tile) {
        tile.style.transition = "transform 460ms cubic-bezier(.2,.8,.18,1), box-shadow 180ms ease";
        tile.style.transform = "";
      });
    });

    window.setTimeout(function () {
      movingTiles.forEach(function (tile) {
        tile.classList.remove("moving");
        tile.style.transition = "";
        tile.style.transform = "";
      });
    }, 520);
  }

  function switchPuzzle(id) {
    var next = getPuzzleById(id);
    if (!next || next.id === currentPuzzle.id) return;
    currentPuzzle = next;
    state = loadState(currentPuzzle);
    dailyPuzzle = getDailyPuzzle();
    updateUrl();
    closeModals();
    render();
    if (!isComplete()) setMessage("Kies drie woorden die bij elkaar horen.", "neutral");
  }

  function getBoardWords() {
    return state.order.slice();
  }

  function getSolvedLayoutOrder(baseOrder, puzzle, targetState) {
    var puzzleWords = getPuzzleWords(puzzle);
    var order = sanitizeOrder(baseOrder, puzzleWords);
    var solvedIds = targetState.solvedCategoryIds || [];
    if (!solvedIds.length) return order;

    var slots = new Array(9).fill(null);
    var used = new Set();

    function place(slot, word) {
      if (!word || used.has(word)) return;
      slots[slot] = word;
      used.add(word);
    }

    function wordsFor(categoryId) {
      var guess = (targetState.guesses || []).find(function (candidate) {
        return candidate.result === "correct" && candidate.categoryId === categoryId;
      });
      if (guess && guess.words && guess.words.length === MAX_SELECTION) return guess.words.slice();

      var category = puzzle.categories.find(function (candidate) {
        return candidate.id === categoryId;
      });
      return category ? category.words.slice() : [];
    }

    if (solvedIds.length === 1) {
      wordsFor(solvedIds[0]).forEach(function (word, index) {
        place([0, 4, 8][index], word);
      });
    } else {
      place(4, puzzle.special);

      wordsFor(solvedIds[0]).filter(function (word) {
        return word !== puzzle.special;
      }).forEach(function (word, index) {
        place([0, 8][index], word);
      });

      wordsFor(solvedIds[1]).filter(function (word) {
        return word !== puzzle.special;
      }).forEach(function (word, index) {
        place([2, 6][index], word);
      });
    }

    var remaining = order.filter(function (word) {
      return !used.has(word);
    });
    puzzleWords.forEach(function (word) {
      if (!used.has(word) && remaining.indexOf(word) === -1) remaining.push(word);
    });

    return slots.map(function (word) {
      if (word) return word;
      return remaining.shift();
    });
  }

  function getSolvedWordInfo(word) {
    var matches = state.solvedCategoryIds.map(function (categoryId, solvedIndex) {
      var category = getCategoryById(categoryId);
      if (!category || category.words.indexOf(word) === -1) return null;
      var categoryIndex = currentPuzzle.categories.findIndex(function (candidate) {
        return candidate.id === category.id;
      });
      return {
        label: category.label,
        solvedIndex: solvedIndex,
        colorIndex: categoryIndex % 4
      };
    }).filter(Boolean);

    if (!matches.length) return null;
    var latest = matches[matches.length - 1];
    return {
      label: latest.label,
      colorIndex: latest.colorIndex,
      colors: matches.map(function (match) {
        return match.colorIndex;
      }),
      count: matches.length
    };
  }

  function findMatchingCategory(words, includeSolved) {
    var key = normalizeWords(words);
    var solved = new Set(state.solvedCategoryIds);
    return currentPuzzle.categories.find(function (category) {
      if (!includeSolved && solved.has(category.id)) return false;
      if (includeSolved && !solved.has(category.id)) return false;
      return normalizeWords(category.words) === key;
    });
  }

  function getCategoryById(id) {
    return currentPuzzle.categories.find(function (category) {
      return category.id === id;
    });
  }

  function getPuzzleById(id) {
    return sortedPuzzles.find(function (puzzle) {
      return puzzle.id === id;
    });
  }

  function isComplete() {
    return Boolean(state.completedAt) || state.solvedCategoryIds.length === currentPuzzle.categories.length;
  }

  function isFailed() {
    return state.mistakes >= 3;
  }

  function getScore(targetState, puzzle) {
    return getScoringResult(targetState, puzzle || currentPuzzle).score;
  }

  function getScoringResult(targetState, puzzle) {
    var guesses = Array.isArray(targetState.guesses) ? targetState.guesses : [];
    var correctGuesses = guesses.filter(function (guess) {
      return guess.result === "correct";
    });
    var wrongGuesses = guesses.filter(function (guess) {
      return guess.result === "wrong";
    });
    var solvedColorOrder = correctGuesses.map(function (guess) {
      return getCategoryColorIndex(puzzle, guess.categoryId);
    }).filter(function (index) {
      return index !== -1;
    });
    var elapsedSeconds = getElapsedSeconds(targetState);
    var details = [];
    var badges = [];
    var mistakePenalty = getMistakePenalty(guesses, puzzle);
    var score = 100 - mistakePenalty;
    var allGuessesHaveSharedWord = guesses.length > 0 && guesses.every(function (guess) {
      return guess.words && guess.words.indexOf(puzzle.special) !== -1;
    });
    var hubFirst = allGuessesHaveSharedWord && guesses.every(function (guess) {
      return guess.words[0] === puzzle.special;
    });
    var hubMiddle = allGuessesHaveSharedWord && guesses.every(function (guess) {
      return guess.words[1] === puzzle.special;
    });
    var ruleBreaker = allGuessesHaveSharedWord && guesses.every(function (guess) {
      return guess.words[2] === puzzle.special;
    });
    var reverseRainbow = sameOrder(solvedColorOrder, [3, 2, 1, 0]);
    var rainbow = sameOrder(solvedColorOrder, [0, 1, 2, 3]);
    var grellow = sameOrder(solvedColorOrder, [3, 2, 0, 1]);
    var grue = sameOrder(solvedColorOrder, [3, 1, 2, 0]);
    var streak = isStateComplete(targetState, puzzle) ? getCurrentStreak(puzzle, targetState) : 0;
    var perfectGame = wrongGuesses.length === 0 && hubFirst && reverseRainbow;

    details.push("Start: 100");
    if (mistakePenalty) details.push("Fouten: -" + mistakePenalty);

    if (hubFirst) {
      score += 20;
      details.push("Hub Eerst: +20");
    }
    if (hubMiddle) {
      score += 20;
      details.push("Hub Midden: +20");
    }
    if (solvedColorOrder[0] === 2) {
      score += 5;
      details.push("Blauw Eerst: +5");
    }
    if (solvedColorOrder[0] === 3) {
      score += 15;
      details.push("Paars Eerst: +15");
    }
    if (reverseRainbow) {
      score += 30;
      details.push("Omgekeerde Regenboog: +30");
    }
    if (elapsedSeconds !== null && elapsedSeconds < 90) {
      score += 30;
      details.push("Onder 90 seconden: +30");
    }

    if (rainbow) badges.push("🌈 Regenboog");
    if (grellow) badges.push("🎾 Grellow");
    if (grue) badges.push("🦚 Grue");
    if (wrongGuesses.length === 0 && hubFirst && (grellow || grue)) {
      badges.push("😤 God Damnit!");
    }

    if (perfectGame) {
      score = 200;
      badges.push("Perfect Game");
      details.push("Perfect Game: 200");
      if (elapsedSeconds !== null && elapsedSeconds < 90) {
        badges.push("🥇 Gouden plaquette");
      } else if (elapsedSeconds !== null && elapsedSeconds < 120) {
        badges.push("🥈 Zilveren plaquette");
      }
    }

    if (streak) {
      score += streak;
      details.push("Dagreeks: +" + streak);
    }

    if (ruleBreaker) {
      score = -100;
      details = ["RULE BREAKER: -100"];
      badges = ["RULE BREAKER"];
    }

    return {
      score: score,
      details: details,
      badges: badges,
      elapsedSeconds: elapsedSeconds,
      streak: streak,
      mistakePenalty: mistakePenalty,
      colorOrder: solvedColorOrder.map(function (index) {
        return GROUP_COLORS[index];
      })
    };
  }

  function renderScoreBreakdown(scoring) {
    els.scoreBreakdown.innerHTML = "";

    scoring.badges.forEach(function (badge) {
      var badgeEl = document.createElement("span");
      badgeEl.className = "score-badge";
      badgeEl.textContent = badge;
      els.scoreBreakdown.appendChild(badgeEl);
    });

    scoring.details.forEach(function (detail) {
      var detailEl = document.createElement("span");
      detailEl.className = "score-detail";
      detailEl.textContent = detail;
      els.scoreBreakdown.appendChild(detailEl);
    });
  }

  function getMistakePenalty(guesses, puzzle) {
    var solvedBefore = 0;
    return guesses.reduce(function (total, guess) {
      if (guess.result === "correct") {
        solvedBefore += 1;
        return total;
      }

      if (guess.result !== "wrong") return total;
      var groupsLeft = Number.isFinite(guess.groupsLeft) ? guess.groupsLeft : puzzle.categories.length - solvedBefore;
      return total + (groupsLeft === 2 ? 30 : 15);
    }, 0);
  }

  function getElapsedSeconds(targetState) {
    if (!targetState.startedAt || !targetState.completedAt) return null;
    var started = new Date(targetState.startedAt).getTime();
    var completed = new Date(targetState.completedAt).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null;
    return Math.round((completed - started) / 1000);
  }

  function formatElapsed(seconds) {
    if (seconds === null) return "tijd onbekend";
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    if (!minutes) return seconds + " sec";
    return minutes + ":" + String(rest).padStart(2, "0");
  }

  function getCurrentStreak(puzzle, targetState) {
    var streak = 0;
    var expectedDate = puzzle.date;
    for (var i = sortedPuzzles.length - 1; i >= 0; i -= 1) {
      var candidate = sortedPuzzles[i];
      if (candidate.date > puzzle.date) continue;
      if (candidate.date < expectedDate) break;
      if (candidate.date !== expectedDate) continue;

      var saved = candidate.id === puzzle.id ? targetState : readStoredState(candidate);
      if (!saved || !isStateComplete(saved, candidate)) break;

      streak += 1;
      expectedDate = getPreviousDateString(expectedDate);
    }
    return streak;
  }

  function getPreviousDateString(dateString) {
    var parts = dateString.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function isStateComplete(targetState, puzzle) {
    return Boolean(targetState.completedAt) || (targetState.solvedCategoryIds || []).length === puzzle.categories.length;
  }

  function getCategoryColorIndex(puzzle, categoryId) {
    return puzzle.categories.findIndex(function (category) {
      return category.id === categoryId;
    });
  }

  function sameOrder(actual, expected) {
    if (actual.length !== expected.length) return false;
    return actual.every(function (value, index) {
      return value === expected[index];
    });
  }

  function setMessage(text, tone) {
    els.message.textContent = text;
    els.message.dataset.tone = tone || "neutral";
  }

  function renderInlineScore(scoring) {
    var score = document.createElement("button");
    score.type = "button";
    score.className = "score-link";
    score.dataset.openResult = "true";
    score.textContent = isFailed() ? "Niet gehaald" : "Score " + scoring.score;
    els.message.innerHTML = "";
    els.message.dataset.tone = "score";
    els.message.appendChild(score);
  }

  function setTemporaryMessage(text, tone) {
    setMessage(text, tone);
    if (!isComplete()) return;
    window.setTimeout(function () {
      renderInlineScore(getScoringResult(state, currentPuzzle));
    }, 1200);
  }

  function pulseSelection() {
    var selected = els.tileGrid.querySelectorAll(".tile.selected");
    selected.forEach(function (tile) {
      tile.classList.remove("pulse");
      void tile.offsetWidth;
      tile.classList.add("pulse");
    });
  }

  function shakeSelection() {
    shakeTiles(els.tileGrid.querySelectorAll(".tile.selected"));
  }

  function shakeWords(words) {
    shakeTiles(words.map(function (word) {
      return els.tileGrid.querySelector("[data-word=\"" + cssEscape(word) + "\"]");
    }).filter(Boolean));
  }

  function shakeTiles(tiles) {
    tiles.forEach(function (tile) {
      tile.classList.remove("shake");
      void tile.offsetWidth;
      tile.classList.add("shake");
    });
  }

  function animateSelected(className) {
    var selected = els.tileGrid.querySelectorAll(".tile.selected");
    selected.forEach(function (tile) {
      tile.classList.add(className);
    });
  }

  function renderArchive() {
    els.archiveList.innerHTML = "";

    sortedPuzzles.slice().reverse().forEach(function (puzzle) {
      var saved = readStoredState(puzzle);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "archive-item";
      if (puzzle.id === currentPuzzle.id) button.classList.add("current");
      if (puzzle.id === dailyPuzzle.id) button.classList.add("daily");

      var main = document.createElement("span");
      main.textContent = "#" + puzzle.number + " · " + formatDate(puzzle.date);

      var status = document.createElement("strong");
      status.textContent = getArchiveStatus(saved, puzzle);

      button.appendChild(main);
      button.appendChild(status);
      button.addEventListener("click", function () {
        switchPuzzle(puzzle.id);
      });
      els.archiveList.appendChild(button);
    });
  }

  function getArchiveStatus(saved, puzzle) {
    if (!saved) return "Niet gestart";
    if (saved.completedAt || saved.solvedCategoryIds.length === 4) {
      return "Klaar · score " + getScore(saved, puzzle);
    }
    if (saved.solvedCategoryIds.length > 0 || saved.guesses.length > 0) {
      return "Bezig · " + saved.solvedCategoryIds.length + "/4";
    }
    return "Niet gestart";
  }

  function openModal(modal) {
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    var focusTarget = modal.querySelector("[data-close-modal]") || modal.querySelector("button");
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function closeModals() {
    [els.archiveModal, els.scoringModal, els.resultPanel].forEach(closeModal);
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
  }

  function copyShareText() {
    var text = buildShareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setTemporaryMessage("Resultaat gekopieerd.", "success");
      }).catch(function () {
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.className = "copy-buffer";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      setTemporaryMessage("Resultaat gekopieerd.", "success");
    } catch (error) {
      setTemporaryMessage("Kopieren lukte niet automatisch.", "error");
    }
    textarea.remove();
  }

  function buildShareText() {
    var scoring = getScoringResult(state, currentPuzzle);
    var rows = state.guesses.map(function (guess) {
      return guess.result === "correct" ? "🟩🟩🟩" : "⬜⬜⬜";
    });
    var cleanUrl = window.location.href.split("?")[0].split("#")[0];
    return [
      "4 keer 3 #" + currentPuzzle.number + " (" + formatDate(currentPuzzle.date) + ")",
      "Score " + scoring.score + " · " + state.solvedCategoryIds.length + "/4 · " + plural(state.mistakes, "fout", "fouten"),
      scoring.badges.join(" · "),
      rows.join("\n"),
      cleanUrl
    ].filter(Boolean).join("\n");
  }

  function loadState(puzzle) {
    var saved = readStoredState(puzzle);
    var words = getPuzzleWords(puzzle);
    if (!saved) return createState(puzzle);

    var wordSet = new Set(words);
    var categoryIds = new Set(puzzle.categories.map(function (category) {
      return category.id;
    }));

    saved.order = sanitizeOrder(saved.order, words);
    saved.selected = (saved.selected || []).filter(function (word) {
      return wordSet.has(word);
    }).slice(0, MAX_SELECTION);
    saved.solvedCategoryIds = (saved.solvedCategoryIds || []).filter(function (id, index, list) {
      return categoryIds.has(id) && list.indexOf(id) === index;
    });
    saved.guesses = Array.isArray(saved.guesses) ? saved.guesses : [];
    saved.mistakes = Number.isFinite(saved.mistakes) ? saved.mistakes : 0;
    saved.completedAt = saved.completedAt || null;
    saved.startedAt = saved.startedAt || null;
    saved.order = getSolvedLayoutOrder(saved.order, puzzle, saved);
    return saved;
  }

  function createState(puzzle) {
    return {
      puzzleId: puzzle.id,
      order: seededShuffle(getPuzzleWords(puzzle), puzzle.id),
      selected: [],
      solvedCategoryIds: [],
      guesses: [],
      mistakes: 0,
      startedAt: new Date().toISOString(),
      completedAt: null
    };
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + currentPuzzle.id, JSON.stringify(state));
    } catch (error) {
      setMessage("Voortgang opslaan lukt niet in deze browser.", "warn");
    }
  }

  function readStoredState(puzzle) {
    try {
      var raw = window.localStorage.getItem(STORAGE_PREFIX + puzzle.id);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function sanitizeOrder(order, words) {
    var wordSet = new Set(words);
    var clean = Array.isArray(order) ? order.filter(function (word, index, list) {
      return wordSet.has(word) && list.indexOf(word) === index;
    }) : [];

    words.forEach(function (word) {
      if (clean.indexOf(word) === -1) clean.push(word);
    });

    return clean;
  }

  function getInitialPuzzle() {
    var requested = new URLSearchParams(window.location.search).get("p");
    return getPuzzleById(requested) || dailyPuzzle;
  }

  function updateUrl() {
    if (!window.history || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    if (currentPuzzle.id === dailyPuzzle.id) {
      url.searchParams.delete("p");
    } else {
      url.searchParams.set("p", currentPuzzle.id);
    }
    window.history.replaceState(null, "", url.toString());
  }

  function getDailyPuzzle() {
    var today = getAmsterdamDateString(new Date());
    var exact = sortedPuzzles.find(function (puzzle) {
      return puzzle.date === today;
    });
    if (exact) return exact;

    for (var i = sortedPuzzles.length - 1; i >= 0; i -= 1) {
      if (sortedPuzzles[i].date <= today) return sortedPuzzles[i];
    }
    return sortedPuzzles[0];
  }

  function getAmsterdamDateString(date) {
    var parts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    var map = {};
    parts.forEach(function (part) {
      map[part.type] = part.value;
    });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function formatDate(dateString) {
    var parts = dateString.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "short"
    }).format(date);
  }

  function getPuzzleWords(puzzle) {
    var words = [];
    puzzle.categories.forEach(function (category) {
      category.words.forEach(function (word) {
        if (words.indexOf(word) === -1) words.push(word);
      });
    });
    return words;
  }

  function normalizeWords(words) {
    return words.slice().sort(function (a, b) {
      return a.localeCompare(b, "nl");
    }).join("|");
  }

  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function plural(count, singular, pluralWord) {
    return count + " " + (count === 1 ? singular : pluralWord);
  }

  function seededShuffle(words, seedText) {
    return shuffle(words.slice(), seededRandom(hashString(seedText)));
  }

  function shuffle(items, random) {
    for (var i = items.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
    return items;
  }

  function hashString(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    return function () {
      seed = Math.imul(seed, 1664525) + 1013904223;
      return (seed >>> 0) / 4294967296;
    };
  }

  function validatePuzzles(puzzles) {
    if (!puzzles.length) throw new Error("Geen puzzels gevonden.");

    puzzles.forEach(function (puzzle) {
      if (puzzle.categories.length !== 4) {
        throw new Error("Puzzel " + puzzle.id + " heeft geen vier groepen.");
      }

      puzzle.categories.forEach(function (category) {
        if (category.words.length !== 3) {
          throw new Error("Groep " + category.id + " heeft geen drie woorden.");
        }
        if (category.words.indexOf(puzzle.special) === -1) {
          throw new Error("Groep " + category.id + " mist het gedeelde woord.");
        }
      });

      if (getPuzzleWords(puzzle).length !== 9) {
        throw new Error("Puzzel " + puzzle.id + " moet negen unieke woorden hebben.");
      }
    });
  }
})();
