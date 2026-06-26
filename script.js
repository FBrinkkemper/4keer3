(function () {
  "use strict";

  var PUZZLES = window.FOUR_KEER_DRIE_PUZZLES || [];
  var TIME_ZONE = "Europe/Amsterdam";
  var STORAGE_PREFIX = "4keer3:state:v2:";
  var MAX_SELECTION = 3;
  var GROUP_COLORS = ["groen", "geel", "blauw", "paars"];
  var GROUP_SHADE_COLORS = ["#d9eddf", "#f8ebaa", "#dcecff", "#eee4ff"];
  var GROUP_CONFETTI_COLORS = [
    ["#6ba784", "#226150", "#d9eddf"],
    ["#f3bd13", "#ad7a12", "#fff0a6"],
    ["#5b8de8", "#194d72", "#dcecff"],
    ["#9b69df", "#5d3da6", "#eee4ff"]
  ];
  var locked = false;
  var archiveFutureUnlocked = false;
  var archiveLongPressTimer = null;
  var resetScoresConfirmTimer = null;
  var temporaryMessageTimer = null;
  var resultFlairTimer = null;

  var els = {
    app: document.getElementById("app"),
    puzzleLabel: document.getElementById("puzzleLabel"),
    progressRow: document.querySelector(".progress-row"),
    scoreLabel: document.getElementById("scoreLabel"),
    mistakeLabel: document.getElementById("mistakeLabel"),
    solvedGroups: document.getElementById("solvedGroups"),
    tileGrid: document.getElementById("tileGrid"),
    message: document.getElementById("message"),
    todayButton: document.getElementById("todayButton"),
    archiveButton: document.getElementById("archiveButton"),
    resultPanel: document.getElementById("resultPanel"),
    resultTitle: document.getElementById("resultTitle"),
    resultText: document.getElementById("resultText"),
    scoreBreakdown: document.getElementById("scoreBreakdown"),
    sharePreviewCanvas: document.getElementById("sharePreviewCanvas"),
    shareImageButton: document.getElementById("shareImageButton"),
    archiveModal: document.getElementById("archiveModal"),
    archiveTitle: document.getElementById("archiveTitle"),
    archiveList: document.getElementById("archiveList"),
    resetScoresButton: document.getElementById("resetScoresButton"),
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
  var wasCompleteOnLastRender = isComplete();

  bindEvents();
  render();
  updateUrl();
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
    els.scoreLabel.addEventListener("click", function (event) {
      if (event.target.matches("[data-open-result]")) {
        openModal(els.resultPanel);
      }
    });

    els.todayButton.addEventListener("click", function () {
      switchPuzzle(dailyPuzzle.id);
    });
    els.archiveButton.addEventListener("click", function () {
      archiveFutureUnlocked = false;
      renderArchive();
      openModal(els.archiveModal);
    });
    els.scoringButton.addEventListener("click", function () {
      openModal(els.scoringModal);
    });
    els.shareImageButton.addEventListener("click", shareResultImage);
    els.resetScoresButton.addEventListener("click", resetScores);
    els.archiveTitle.addEventListener("pointerdown", startArchiveLongPress);
    els.archiveTitle.addEventListener("pointerup", cancelArchiveLongPress);
    els.archiveTitle.addEventListener("pointerleave", cancelArchiveLongPress);
    els.archiveTitle.addEventListener("pointercancel", cancelArchiveLongPress);
    els.archiveTitle.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });

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

  function startArchiveLongPress() {
    cancelArchiveLongPress();
    archiveLongPressTimer = window.setTimeout(function () {
      archiveFutureUnlocked = true;
      renderArchive();
    }, 700);
  }

  function cancelArchiveLongPress() {
    if (!archiveLongPressTimer) return;
    window.clearTimeout(archiveLongPressTimer);
    archiveLongPressTimer = null;
  }

  function render() {
    var complete = isComplete();
    var becameComplete = complete && !wasCompleteOnLastRender;

    els.puzzleLabel.textContent = "#" + currentPuzzle.number + " · " + formatDate(currentPuzzle.date);
    renderDots(els.mistakeLabel, 3, Math.min(state.mistakes, 3), "mistake", "Fouten:");
    els.progressRow.classList.toggle("score-visible", complete);
    if (!complete) {
      els.scoreLabel.hidden = true;
      els.scoreLabel.innerHTML = "";
    }
    els.todayButton.disabled = currentPuzzle.id === dailyPuzzle.id;

    renderSolvedGroups();
    renderTiles();

    if (complete) {
      var scoring = getScoringResult(state, currentPuzzle);
      els.resultTitle.textContent = isFailed() ? "Niet gehaald" : "Score " + scoring.score;
      els.resultText.textContent = plural(state.guesses.length, "poging", "pogingen") + " · " + plural(state.mistakes, "fout", "fouten") + " · " + formatElapsed(scoring.elapsedSeconds);
      renderScoreBreakdown(scoring);
      renderSharePreview();
      renderInlineScore(scoring);
      els.resultPanel.classList.toggle("result-win", !isFailed());
      els.resultPanel.classList.toggle("result-loss", isFailed());
      if (becameComplete) openResultWithFlair();
    } else {
      closeModal(els.resultPanel);
      els.scoreBreakdown.innerHTML = "";
      clearSharePreview();
      els.resultPanel.classList.remove("result-win", "result-loss", "show-flair");
    }
    wasCompleteOnLastRender = complete;
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

    window.requestAnimationFrame(fitTileLabels);
  }

  function fitTileLabels() {
    els.tileGrid.querySelectorAll(".tile").forEach(function (tile) {
      var size = parseFloat(window.getComputedStyle(tile).fontSize);
      if (!Number.isFinite(size)) return;

      while (size > 8.5 && (tile.scrollWidth > tile.clientWidth || tile.scrollHeight > tile.clientHeight)) {
        size -= 0.5;
        tile.style.fontSize = size + "px";
      }
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
      submitGuess();
      return;
    }

    setMessage("Kies drie woorden die bij elkaar horen.", "neutral");
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
      launchGroupConfetti(getCategoryColorIndex(currentPuzzle, match.id));
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

  function switchPuzzle(id, allowFuture) {
    var next = allowFuture ? getPuzzleById(id) : getVisiblePuzzleById(id);
    if (!next || next.id === currentPuzzle.id) return;
    currentPuzzle = next;
    state = loadState(currentPuzzle);
    wasCompleteOnLastRender = isComplete();
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

  function isFailedState(targetState) {
    return targetState.mistakes >= 3;
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
    var purpleFirst = solvedColorOrder[0] === 3;
    var purpleBonus = purpleFirst ? 30 : 0;
    var timeBonus = isStateComplete(targetState, puzzle) && !isFailedState(targetState) ? getTimeBonus(elapsedSeconds) : 0;
    var score = isFailedState(targetState) ? 0 : Math.max(0, 100 - mistakePenalty + purpleBonus + timeBonus);

    details.push("Start: 100");
    if (mistakePenalty) details.push("Fouten: -" + mistakePenalty);
    if (timeBonus) details.push("Tijdbonus: +" + timeBonus);
    if (purpleBonus) {
      details.push("Paars eerst: +" + purpleBonus);
      badges.push("Paars eerst");
    }
    if (isFailedState(targetState)) details.push("Niet gehaald: 0");

    return {
      score: score,
      details: details,
      badges: badges,
      elapsedSeconds: elapsedSeconds,
      mistakePenalty: mistakePenalty,
      timeBonus: timeBonus,
      purpleBonus: purpleBonus,
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

  function renderSharePreview() {
    if (!els.sharePreviewCanvas) return;
    var context = els.sharePreviewCanvas.getContext("2d");
    if (!context) return;
    drawShareImage(context, els.sharePreviewCanvas.width);
  }

  function clearSharePreview() {
    if (!els.sharePreviewCanvas) return;
    var context = els.sharePreviewCanvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, els.sharePreviewCanvas.width, els.sharePreviewCanvas.height);
  }

  function getMistakePenalty(guesses, puzzle) {
    return guesses.filter(function (guess) {
      return guess.result === "wrong";
    }).length * 15;
  }

  function getTimeBonus(seconds) {
    if (seconds === null) return 0;
    return Math.max(0, Math.round(90 - Math.min(seconds, 90)));
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
    els.scoreLabel.hidden = false;
    els.scoreLabel.innerHTML = "";
    els.scoreLabel.appendChild(score);
  }

  function setTemporaryMessage(text, tone) {
    if (temporaryMessageTimer) {
      window.clearTimeout(temporaryMessageTimer);
      temporaryMessageTimer = null;
    }
    setMessage(text, tone);
    if (!isComplete()) return;
    temporaryMessageTimer = window.setTimeout(function () {
      setMessage("", "neutral");
      temporaryMessageTimer = null;
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

  function launchGroupConfetti(colorIndex) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var selected = els.tileGrid.querySelectorAll(".tile.selected");
    if (!selected.length) return;

    var colors = GROUP_CONFETTI_COLORS[colorIndex] || GROUP_CONFETTI_COLORS[0];
    var layer = document.createElement("div");
    layer.className = "group-confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    selected.forEach(function (tile) {
      var rect = tile.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;

      for (var index = 0; index < 10; index += 1) {
        var angle = Math.random() * Math.PI * 2;
        var distance = 28 + Math.random() * 58;
        var piece = document.createElement("span");
        piece.className = "confetti-piece";
        if (index % 3 === 0) piece.classList.add("round");
        piece.style.left = centerX + "px";
        piece.style.top = centerY + "px";
        piece.style.setProperty("--confetti-color", colors[index % colors.length]);
        piece.style.setProperty("--x", Math.cos(angle) * distance + "px");
        piece.style.setProperty("--y", Math.sin(angle) * distance - 26 + "px");
        piece.style.setProperty("--fall", 20 + Math.random() * 30 + "px");
        piece.style.setProperty("--rotate", (120 + Math.random() * 300) + "deg");
        piece.style.setProperty("--size", 5 + Math.random() * 5 + "px");
        piece.style.animationDelay = Math.random() * 90 + "ms";
        layer.appendChild(piece);
      }
    });

    window.setTimeout(function () {
      layer.remove();
    }, 1050);
  }

  function renderArchive() {
    els.archiveList.innerHTML = "";

    getArchivePuzzles().slice().reverse().forEach(function (puzzle) {
      var saved = readStoredState(puzzle);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "archive-item";
      if (puzzle.id === currentPuzzle.id) button.classList.add("current");
      if (puzzle.id === dailyPuzzle.id) button.classList.add("daily");
      if (!isReleasedPuzzle(puzzle)) button.classList.add("future");

      var main = document.createElement("span");
      main.textContent = "#" + puzzle.number + " · " + formatDate(puzzle.date);

      var status = document.createElement("strong");
      status.textContent = getArchiveStatus(saved, puzzle);

      button.appendChild(main);
      button.appendChild(status);
      button.addEventListener("click", function () {
        switchPuzzle(puzzle.id, archiveFutureUnlocked);
      });
      els.archiveList.appendChild(button);
    });
  }

  function getArchiveStatus(saved, puzzle) {
    if (!isReleasedPuzzle(puzzle)) return "Gepland";
    if (!saved) return "Niet gestart";
    if (saved.completedAt || saved.solvedCategoryIds.length === 4) {
      return "Klaar · score " + getScore(saved, puzzle);
    }
    if (saved.solvedCategoryIds.length > 0 || saved.guesses.length > 0) {
      return "Bezig · " + saved.solvedCategoryIds.length + "/4";
    }
    return "Niet gestart";
  }

  function resetScores() {
    if (!els.resetScoresButton.classList.contains("confirm")) {
      els.resetScoresButton.classList.add("confirm");
      els.resetScoresButton.textContent = "Zeker resetten?";
      if (resetScoresConfirmTimer) window.clearTimeout(resetScoresConfirmTimer);
      resetScoresConfirmTimer = window.setTimeout(resetResetScoresButton, 2600);
      return;
    }

    try {
      for (var index = window.localStorage.length - 1; index >= 0; index -= 1) {
        var key = window.localStorage.key(index);
        if (key && key.indexOf(STORAGE_PREFIX) === 0) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {
      resetResetScoresButton();
      setMessage("Scores resetten lukte niet in deze browser.", "warn");
      return;
    }

    locked = false;
    state = createState(currentPuzzle);
    wasCompleteOnLastRender = false;
    resetResetScoresButton();
    render();
    renderArchive();
    setMessage("Scores gereset.", "neutral");
  }

  function resetResetScoresButton() {
    if (resetScoresConfirmTimer) {
      window.clearTimeout(resetScoresConfirmTimer);
      resetScoresConfirmTimer = null;
    }
    els.resetScoresButton.classList.remove("confirm");
    els.resetScoresButton.textContent = "Reset scores";
  }

  function openModal(modal) {
    modal.hidden = false;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    var focusTarget = modal.querySelector("[data-close-modal]") || modal.querySelector("button");
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function openResultWithFlair() {
    if (resultFlairTimer) {
      window.clearTimeout(resultFlairTimer);
      resultFlairTimer = null;
    }
    els.resultPanel.classList.remove("show-flair");
    void els.resultPanel.offsetWidth;
    els.resultPanel.classList.add("show-flair");
    openModal(els.resultPanel);
    resultFlairTimer = window.setTimeout(function () {
      els.resultPanel.classList.remove("show-flair");
      resultFlairTimer = null;
    }, 1400);
  }

  function closeModals() {
    [els.archiveModal, els.scoringModal, els.resultPanel].forEach(closeModal);
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
    if (modal === els.resultPanel) {
      modal.classList.remove("show-flair");
      if (resultFlairTimer) {
        window.clearTimeout(resultFlairTimer);
        resultFlairTimer = null;
      }
    }
    if (modal === els.archiveModal) {
      archiveFutureUnlocked = false;
      cancelArchiveLongPress();
      resetResetScoresButton();
    }
  }

  function shareResultImage() {
    if (!isComplete()) {
      setMessage("Maak de puzzel eerst af.", "warn");
      return;
    }

    var originalLabel = els.shareImageButton.textContent;
    els.shareImageButton.disabled = true;
    els.shareImageButton.textContent = "Maakt afbeelding...";

    buildShareImageBlob().then(function (blob) {
      var fileName = "4keer3-" + currentPuzzle.number + ".png";
      var file = typeof File === "function" ? new File([blob], fileName, { type: "image/png" }) : null;

      if (canUseNativeImageShare(file)) {
        return navigator.share({
          files: [file],
          title: "4 keer 3 #" + currentPuzzle.number,
          text: buildShareText()
        }).then(function () {
          setTemporaryMessage("Afbeelding gedeeld.", "success");
        }).catch(function (error) {
          if (error && error.name === "AbortError") throw error;
          return shareImageFallback(blob, fileName);
        });
      }

      return shareImageFallback(blob, fileName);
    }).catch(function (error) {
      if (error && error.name === "AbortError") return;
      setTemporaryMessage("Afbeelding maken lukte niet.", "error");
    }).finally(function () {
      els.shareImageButton.disabled = false;
      els.shareImageButton.textContent = originalLabel;
    });
  }

  function canUseNativeImageShare(file) {
    return Boolean(
      file &&
      window.location.protocol === "https:" &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    );
  }

  function shareImageFallback(blob, fileName) {
    return copyImageToClipboard(blob).then(function () {
      setTemporaryMessage("Afbeelding gekopieerd.", "success");
    }).catch(function () {
      downloadImageBlob(blob, fileName);
      setTemporaryMessage("Afbeelding gedownload.", "success");
    });
  }

  function copyImageToClipboard(blob) {
    if (!navigator.clipboard || typeof ClipboardItem !== "function") {
      return Promise.reject(new Error("Clipboard image writes are unavailable."));
    }
    var item = new ClipboardItem({ "image/png": blob });
    return navigator.clipboard.write([item]);
  }

  function downloadImageBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function buildShareImageBlob() {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement("canvas");
      var size = 1024;
      canvas.width = size;
      canvas.height = size;
      var context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas is unavailable."));
        return;
      }

      drawShareImage(context, size);
      canvas.toBlob(function (blob) {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Image export failed."));
        }
      }, "image/png");
    });
  }

  function drawShareImage(context, size) {
    var colors = ["#57ba72", "#f3bd13", "#5b8de8", "#9b69df"];
    var scoring = getScoringResult(state, currentPuzzle);
    var rows = getShareRows();
    var center = size / 2;

    context.fillStyle = "#f8f5ee";
    context.fillRect(0, 0, size, size);

    roundedRect(context, 34, 34, size - 68, size - 68, 56);
    context.fillStyle = "#f8f5ee";
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = "#d8d2c7";
    context.stroke();

    drawShareLogo(context, center, 82, colors);

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#282522";
    context.font = "700 34px Avenir Next, Segoe UI, system-ui, sans-serif";
    context.fillText(formatShareDate(currentPuzzle.date), center, 222);

    context.fillStyle = "#7b746a";
    context.font = "500 34px Avenir Next, Segoe UI, system-ui, sans-serif";
    context.fillText(getShareStatus(scoring), center, 272);

    drawShareGrid(context, colors, center, 338, rows);

    context.fillStyle = "#a19a90";
    context.font = "700 28px Avenir Next, Segoe UI, system-ui, sans-serif";
    context.fillText("vier groepen · drie woorden · een gedeeld", center, 884);

    context.fillStyle = "#8c857c";
    context.font = "800 28px Avenir Next, Segoe UI, system-ui, sans-serif";
    context.fillText(getShareHost(), center, 930);
  }

  function drawShareLogo(context, center, top, colors) {
    var blockWidth = 29;
    var blockHeight = 19;
    var gap = 6;
    var totalWidth = colors.length * blockWidth + (colors.length - 1) * gap;
    var left = center - totalWidth / 2;

    colors.forEach(function (color, index) {
      drawLogoBlock(context, left + index * (blockWidth + gap), top, blockWidth, blockHeight, color);
    });

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#2b2825";
    context.font = "900 58px Avenir Next, Segoe UI Black, system-ui, sans-serif";
    context.fillText("4×3", center, top + 52);

    colors.slice().reverse().forEach(function (color, index) {
      drawLogoBlock(context, left + index * (blockWidth + gap), top + 74, blockWidth, blockHeight, color);
    });
  }

  function drawLogoBlock(context, x, y, width, height, color) {
    roundedRect(context, x, y, width, height, 4);
    context.fillStyle = color;
    context.globalAlpha = 0.55;
    context.fill();
    context.globalAlpha = 1;
  }

  function drawShareGrid(context, colors, center, top, rows) {
    var layout = getShareGridLayout(rows.length);
    var tileSize = layout.tileSize;
    var gap = layout.gap;
    var left = center - (tileSize * 3 + gap * 2) / 2;

    rows.forEach(function (row, rowIndex) {
      var y = top + rowIndex * (tileSize + gap);

      row.words.forEach(function (word, columnIndex) {
        var x = left + columnIndex * (tileSize + gap);
        var colorIndices = getWordColorIndices(row, word);
        if (colorIndices.length > 1) {
          drawSplitShareTile(context, x, y, tileSize, colorIndices.map(function (index) {
            return colors[index];
          }));
        } else {
          drawSolidShareTile(context, x, y, tileSize, colors[colorIndices[0]]);
        }
      });
    });
  }

  function getShareGridLayout(rowCount) {
    var safeRowCount = Math.max(1, rowCount);
    var gap = safeRowCount > 5 ? 12 : 20;
    var availableHeight = 506;
    var tileSize = Math.floor((availableHeight - gap * (safeRowCount - 1)) / safeRowCount);
    return {
      tileSize: Math.max(46, Math.min(94, tileSize)),
      gap: gap
    };
  }

  function getShareRows() {
    var rows = [];
    var usedCategoryIds = new Set();

    state.guesses.forEach(function (guess) {
      if (!Array.isArray(guess.words) || guess.words.length !== MAX_SELECTION) return;
      var category = guess.result === "correct" ? getCategoryById(guess.categoryId) : null;
      rows.push({
        result: guess.result,
        category: category,
        words: guess.words.slice(0, MAX_SELECTION)
      });
      if (category) usedCategoryIds.add(category.id);
    });

    currentPuzzle.categories.forEach(function (category) {
      if (usedCategoryIds.has(category.id)) return;
      rows.push({
        result: "revealed",
        category: category,
        words: getShareRowWords(category, null)
      });
    });

    return rows;
  }

  function getShareRowWords(category, guessedWords) {
    var special = currentPuzzle.special;
    var categoryWords = category.words.slice();
    var source = Array.isArray(guessedWords) && guessedWords.length === MAX_SELECTION ? guessedWords.slice() : null;
    if (source && source.every(function (word) {
      return categoryWords.indexOf(word) !== -1;
    })) {
      return source;
    }

    var otherWords = categoryWords.filter(function (word) {
      return word !== special;
    });
    return [otherWords[0], special, otherWords[1]];
  }

  function getWordColorIndices(row, word) {
    if (word === currentPuzzle.special) return [0, 1, 2, 3];
    var indices = [];
    currentPuzzle.categories.forEach(function (category, index) {
      if (category.words.indexOf(word) !== -1) indices.push(index);
    });
    if (indices.length) return indices;
    if (row && row.category) {
      var fallbackIndex = getCategoryColorIndex(currentPuzzle, row.category.id);
      if (fallbackIndex !== -1) return [fallbackIndex];
    }
    return [0];
  }

  function drawSolidShareTile(context, x, y, size, color) {
    roundedRect(context, x, y, size, size, 18);
    context.fillStyle = color;
    context.fill();
  }

  function drawSplitShareTile(context, x, y, size, colors) {
    context.save();
    roundedRect(context, x, y, size, size, 18);
    context.clip();
    context.fillStyle = colors[2] || colors[0];
    context.fillRect(x, y, size / 2, size / 2);
    context.fillStyle = colors[0];
    context.fillRect(x + size / 2, y, size / 2, size / 2);
    context.fillStyle = colors[3] || colors[0];
    context.fillRect(x, y + size / 2, size / 2, size / 2);
    context.fillStyle = colors[1] || colors[0];
    context.fillRect(x + size / 2, y + size / 2, size / 2, size / 2);
    context.restore();

    roundedRect(context, x + 3, y + 3, size - 6, size - 6, 16);
    context.lineWidth = 6;
    context.strokeStyle = "#d69d00";
    context.stroke();
  }

  function roundedRect(context, x, y, width, height, radius) {
    var safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
    context.lineTo(x + safeRadius, y + height);
    context.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
    context.lineTo(x, y + safeRadius);
    context.arcTo(x, y, x + safeRadius, y, safeRadius);
    context.closePath();
  }

  function getShareStatus(scoring) {
    if (isFailed()) return "Niet gehaald · " + plural(state.mistakes, "fout", "fouten");
    return "Score " + scoring.score + " · " + plural(state.mistakes, "fout", "fouten");
  }

  function formatShareDate(dateString) {
    var parts = dateString.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getShareHost() {
    if (window.location.hostname && !/^127\.|^localhost$/.test(window.location.hostname)) {
      return window.location.hostname;
    }
    return "4keer3.vercel.app";
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
    return getVisiblePuzzleById(requested) || dailyPuzzle;
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

  function getVisiblePuzzleById(id) {
    var puzzle = getPuzzleById(id);
    return isReleasedPuzzle(puzzle) ? puzzle : null;
  }

  function getReleasedPuzzles() {
    var today = getAmsterdamDateString(new Date());
    return sortedPuzzles.filter(function (puzzle) {
      return puzzle.date <= today;
    });
  }

  function getArchivePuzzles() {
    return archiveFutureUnlocked ? sortedPuzzles : getReleasedPuzzles();
  }

  function isReleasedPuzzle(puzzle) {
    return Boolean(puzzle) && puzzle.date <= getAmsterdamDateString(new Date());
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
