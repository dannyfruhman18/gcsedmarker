const QUESTION_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'being',
  'between',
  'both',
  'could',
  'during',
  'each',
  'even',
  'from',
  'into',
  'made',
  'make',
  'more',
  'most',
  'much',
  'must',
  'only',
  'other',
  'over',
  'some',
  'such',
  'than',
  'that',
  'then',
  'there',
  'their',
  'them',
  'these',
  'they',
  'this',
  'those',
  'through',
  'using',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'within',
  'would',
  'your',
  'yours',
  'you',
  'answer',
  'question',
  'prompt',
])

function normaliseText(value) {
  return String(value ?? '').trim()
}

function extractKeywords(text) {
  const words = normaliseText(text).toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []
  return words.filter((word) => !QUESTION_STOPWORDS.has(word))
}

function normalizeScoringOptions(input, legacyTopBand, legacyBoard = 'AQA') {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      questionText: input.questionText ?? '',
      answerText: input.answerText ?? '',
      topBand: Boolean(input.topBand),
      board: input.board || 'AQA',
    }
  }

  return {
    questionText: '',
    answerText: input ?? '',
    topBand: Boolean(legacyTopBand),
    board: legacyBoard || 'AQA',
  }
}

function buildQuestionAnalysis(questionText, answerText) {
  const question = normaliseText(questionText)
  const answer = normaliseText(answerText)
  const commandWordMatch = question.match(
    /\b(explain|compare|evaluate|describe|analyse|analyze|assess|calculate|justify|discuss|outline|state|identify|name|define|summarise|summarize)\b/i,
  )
  const commandWord = commandWordMatch?.[1]?.toLowerCase() ?? ''
  const questionKeywords = Array.from(
    new Set(extractKeywords(question).filter((keyword) => keyword !== commandWord)),
  )
  const answerKeywords = new Set(extractKeywords(answer))
  const matchedKeywords = questionKeywords.filter((keyword) => answerKeywords.has(keyword))
  const missingKeywords = questionKeywords.filter((keyword) => !answerKeywords.has(keyword))
  const commandWordExpectations = {
    explain: /\b(because|therefore|as a result|this shows|which means|so)\b/i,
    compare: /\b(both|whereas|while|however|similarly|in contrast|difference|similar)\b/i,
    evaluate: /\b(overall|judgement|however|although|balance|more important|to a large extent)\b/i,
    describe: /\b(there is|it is|shown by|has|contains|includes|features)\b/i,
    analyse: /\b(because|therefore|suggests|implies|shows|leads to)\b/i,
    analyze: /\b(because|therefore|suggests|implies|shows|leads to)\b/i,
    assess: /\b(overall|judgement|however|although|balance|weigh|more effective)\b/i,
    calculate: /\b(\d|=|×|÷|working|formula|equation|substitut|calculate|solve)\b/i,
    justify: /\b(because|therefore|evidence|reason|supports)\b/i,
    discuss: /\b(however|although|overall|both|on the other hand|balance)\b/i,
    outline: /\b(briefly|overall|main point|mainly|in summary)\b/i,
    state: /\b(shortly|simply|is|are|was|were|equals|=)\b/i,
    identify: /\b(is|are|was|were|means|refers to|shows|represents)\b/i,
    name: /\b(is|are|was|were|called|known as|named)\b/i,
    define: /\b(means|refers to|is the|can be defined|defined as)\b/i,
    summarise: /\b(in summary|overall|briefly|main point|short)\b/i,
    summarize: /\b(in summary|overall|briefly|main point|short)\b/i,
  }
  const commandWordPattern =
    commandWord ? commandWordExpectations[commandWord] ?? /\b(because|therefore|however|overall|working|formula|evidence)\b/i : null
  const usesCommandStyle = commandWordPattern ? commandWordPattern.test(answer) : false
  const keywordCoverage = questionKeywords.length ? matchedKeywords.length / questionKeywords.length : 0

  return {
    question,
    answer,
    questionKeywords,
    matchedKeywords,
    missingKeywords,
    commandWord,
    usesCommandStyle,
    keywordCoverage,
  }
}

function getBoardSpecificFeedback(board, mode) {
  switch (board) {
    case 'AQA':
      return mode === 'essay'
        ? 'AQA focus on AO2 structure: keep each paragraph tightly linked to the question.'
        : 'AQA focus on method: show each calculation step clearly and label your working.'
    case 'Edexcel':
      return mode === 'essay'
        ? 'Edexcel evaluation requirement: make your judgement explicit and supported by evidence.'
        : 'Edexcel focus on method marks: keep substitutions and calculations easy to follow.'
    case 'OCR':
      return mode === 'essay'
        ? 'OCR focus: balance evidence, explanation, and judgement across your response.'
        : 'OCR focus on accuracy: show the working trail and include the final conclusion clearly.'
    case 'WJEC':
      return mode === 'essay'
        ? 'Ensure your points specifically address the WJEC assessment objectives for your subject.'
        : 'WJEC math/science marking values clear step-by-step methodology.'
    default:
      return 'Keep your response aligned to the question and show your reasoning clearly.'
  }
}

export function scoreEssay(options = {}, legacyTopBand, legacyBoard = 'AQA') {
  const { questionText, answerText, topBand, board } = normalizeScoringOptions(
    options,
    legacyTopBand,
    legacyBoard,
  )
  const text = normaliseText(answerText)
  const questionAnalysis = buildQuestionAnalysis(questionText, text)

  if (!text) {
    return {
      maxMarks: 6,
      score: 0,
      ao1: ['You are ready to start — paste a student response and we will help shape it into stronger AO1 evidence.'],
      ao2: ['Even a short answer is enough to begin; adding more detail will unlock clearer AO2 feedback.'],
      ao3: ['Once the response is pasted in, we can point out where judgement and evaluation can be strengthened.'],
      summary: topBand
        ? 'Top Band mode works best once an essay response is pasted in.'
        : 'Paste a response and we will give you encouraging, step-by-step essay feedback.',
    }
  }

  const length = text.split(/\s+/).filter(Boolean).length
  const paragraphBreaks = (text.match(/\n\s*\n/g) ?? []).length
  const ao1 = []
  const ao2 = []
  const ao3 = []
  let score = 0

  const hasDevelopedLength = length >= 80
  const hasEvidenceDetail = /\b(example|examples|evidence|quote|quotes|statistic|statistics|fact|facts|terminology|term|terms|detail|specific|specifically|context)\b/i.test(text)
  const hasReasoning = /\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)
  const hasEvaluation = /\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)
  const hasStructure = paragraphBreaks >= 2
  const hasSustainedDevelopment = length > 150

  if (hasDevelopedLength) {
    ao1.push('Clear subject knowledge shown with enough developed detail to reward.')
    score += 1
  } else if (length > 0) {
    ao1.push('Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (hasEvidenceDetail) {
    ao1.push('You are using specific evidence, examples, or terminology, which strengthens AO1.')
    score += 1
  } else {
    ao1.push('Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (hasReasoning) {
    ao2.push('You are explaining ideas and linking evidence to your point, which supports AO2.')
    score += 1
  } else {
    ao2.push('Develop analysis by explaining how and why the evidence matters.')
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'essay')
  if (boardSpecificFeedback) {
    ao2.push(boardSpecificFeedback)
  }

  if (questionAnalysis.questionKeywords.length) {
    const matchedSnippet = questionAnalysis.matchedKeywords.slice(0, 3).join(', ')
    const missingSnippet = questionAnalysis.missingKeywords.slice(0, 3).join(', ')

    if (questionAnalysis.matchedKeywords.length >= 2 || questionAnalysis.keywordCoverage >= 0.35) {
      score += 1
      ao2.push(
        matchedSnippet
          ? `Question-aware check: key terms such as ${matchedSnippet} appear in the answer.`
          : 'Question-aware check: the answer uses key terms from the prompt, which keeps it focused.',
      )
    } else {
      ao2.push(
        missingSnippet
          ? `Question-aware check: bring in more prompt terms such as ${missingSnippet} so the response stays on task.`
          : 'Question-aware check: use more of the question wording so the response stays on task.',
      )
    }
  }

  if (hasEvaluation) {
    ao3.push('There is some evaluation or judgement, which helps the top bands.')
    score += 1
  } else {
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      ao3.push(
        `The question asks you to ${questionAnalysis.commandWord}, and your response shows that style clearly.`,
      )
    } else {
      ao3.push(
        `The question asks you to ${questionAnalysis.commandWord}, so add more of the matching style (reasoning, comparison, or evaluation).`,
      )
    }
  }

  if (hasStructure) {
    ao3.push('Good paragraph structure identified.')
    score += 1
  } else {
    ao3.push('Consider using paragraph breaks to improve the structure of your essay.')
  }

  if (hasSustainedDevelopment) {
    score += 1
    ao3.push('Sustained development across the response helps to secure the top band.')
    if (topBand) {
      ao3.push('Top Band mode: add a sharp final judgement, embed precise terminology, and make every paragraph move the argument forward.')
      ao2.push('Top Band mode: use linked chains of reasoning and compare alternatives instead of listing points.')
      ao3.push('Top Band mode: refine paragraph sequencing, counterargument, and conclusion flow to maximise impact.')
    }
  } else if (topBand) {
    ao3.push('Top Band feedback unlocks best when the essay is more fully developed (over 150 words). Add more detail and evaluation to push into the top band.')
  }

  return {
    maxMarks: 6,
    score: Math.min(score, 6),
    ao1,
    ao2,
    ao3,
    summary: topBand
      ? hasSustainedDevelopment
        ? 'Grade 9 / Top Band focus: make every paragraph precise, conceptual, and evaluative.'
        : 'Top Band mode is on, but this response needs more development (over 150 words) before full top-band feedback applies.'
      : questionAnalysis.questionKeywords.length
        ? 'Focus on specific knowledge, explanation, and staying aligned to the question.'
        : 'Focus on specific knowledge, explanation, and a clear conclusion.',
  }
}

export function scoreMathsScience(options = {}, legacyTopBand, legacyBoard = 'AQA') {
  const { questionText, answerText, topBand, board } = normalizeScoringOptions(
    options,
    legacyTopBand,
    legacyBoard,
  )
  const text = normaliseText(answerText)
  const questionAnalysis = buildQuestionAnalysis(questionText, text)

  if (!text) {
    return {
      maxMarks: 10,
      score: 0,
      ao1: ['You are ready to begin — paste the working or final answer and we will help identify the method marks.'],
      ao2: ['A few steps are enough to start; adding them will make the process feedback more precise.'],
      ao3: ['Once the answer is in, we can point out the units, scientific idea, or conclusion that will strengthen the response.'],
      summary: topBand
        ? 'Top Band mode works best once a maths/science response is pasted in.'
        : 'Paste working or an answer and we will give you encouraging method-mark feedback.',
      extra: [],
    }
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const methodMarks = []
  const addMethodMark = (message) => {
    if (message && !methodMarks.includes(message)) {
      methodMarks.push(message)
    }
  }

  let score = 0
  const hasMathSignals =
    /\d/.test(text) ||
    /[+\-*/=×÷^√→]/.test(text) ||
    /\b(substitut(e|ion)|calculate|solve|working(?:\s+out)?|show(?:\s+your\s+work|(?:\s+working)?)?|step(?:s)?|equation|formula)\b/i.test(text)
  const hasVisibleCalculation = /\d+[\s\+\-\*\/\=]+\d+/.test(answerText)
  const hasProcessLanguage = /\b(substitut(e|ion)|calculate|show(?:\s+your\s+work|(?:\s+working)?)?|working(?:\s+out)?|step(?:s)?|solve|method|equation|formula)\b|→|=>/i.test(text)
  const hasUnits = /\b(cm|mm|kg|g|mol|dm\^?3|°c)\b|(\d+\s*(m|s|n|j|w)\b)/i.test(text)
  const hasConclusion = /\b(therefore|because|so|hence|which means|final answer)\b/i.test(text)
  const hasFormulaReference = /\b(formula|equation|substitut(e|ion)|calculation|ratio|proportion|graph|table)\b/i.test(text)
  const hasConceptualDetail = /\b(force|energy|mass|velocity|acceleration|reaction|atom|cell|graph|ratio|probability|mean|median|area|volume|gradient|current|voltage|resistance|density|wave|frequency|temperature|power|percentage|speed|distance|time)\b/i.test(text)
  const hasSustainedReasoning = text.length >= 100

  if (lines.length >= 2 && hasMathSignals) {
    score += 2
    addMethodMark('You show more than one line of working, which is good evidence for method marks.')
  } else if (hasMathSignals) {
    score += 1
    addMethodMark('Show the steps you used, not just the final answer.')
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (hasVisibleCalculation) {
    score += 1
    addMethodMark('Your response includes visible calculation symbols, which can help show a working trail.')
  }

  if (hasProcessLanguage) {
    score += 2
    addMethodMark('Your response includes process language or a clear calculation trail.')
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (hasUnits) {
    score += 1
    addMethodMark('You have included units or scientific measurement language.')
  } else {
    addMethodMark('Include units where needed and keep the final answer contextualised.')
  }

  if (hasConclusion) {
    score += 1
    addMethodMark('Detected markers for a conclusion or final answer, which is key for top marks.')
  }

  if (hasFormulaReference) {
    score += 1
    addMethodMark('You reference formulas, equations, or a calculation path, which helps show method.')
  }

  if (hasConceptualDetail) {
    score += 1
    addMethodMark('You include topic vocabulary or scientific context, which helps demonstrate understanding.')
  }

  if (questionAnalysis.questionKeywords.length) {
    const matchedSnippet = questionAnalysis.matchedKeywords.slice(0, 3).join(', ')
    const missingSnippet = questionAnalysis.missingKeywords.slice(0, 3).join(', ')

    if (questionAnalysis.matchedKeywords.length >= 2 || questionAnalysis.keywordCoverage >= 0.35) {
      score += 1
      addMethodMark(
        matchedSnippet
          ? `Question-aware check: you reuse key terms such as ${matchedSnippet}, which keeps the working on task.`
          : 'Question-aware check: you reuse key terms from the prompt, which keeps the working on task.',
      )
    } else {
      addMethodMark(
        missingSnippet
          ? `Question-aware check: use more of the prompt wording such as ${missingSnippet} so the method stays focused.`
          : 'Question-aware check: use more of the prompt wording so the method stays focused.',
      )
    }
  }

  if (hasSustainedReasoning) {
    score += 1
    addMethodMark('Your response is long enough to show a fuller chain of reasoning.')
    if (topBand) {
      addMethodMark('Top Band mode: show a full chain of reasoning, label substitutions, and check the answer against sensible values.')
    }
  } else if (topBand) {
    addMethodMark('Top Band feedback unlocks best when the answer is more fully developed (over 100 words).')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      addMethodMark(`The prompt asks you to ${questionAnalysis.commandWord}, and your response shows that process clearly.`)
    } else {
      addMethodMark(`The prompt asks you to ${questionAnalysis.commandWord}, so make that method style more obvious in your working.`)
    }
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'maths_science')
  if (boardSpecificFeedback) {
    addMethodMark(boardSpecificFeedback)
  }

  return {
    maxMarks: 10,
    score: Math.min(score, 10),
    ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
    ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
    ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : questionAnalysis.questionKeywords.length
        ? 'Method marks focus on visible working, correct process, and staying aligned to the question.'
        : 'Method marks focus on visible working and correct process.',
    extra: methodMarks,
  }
}
