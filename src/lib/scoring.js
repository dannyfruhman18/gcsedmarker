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
  'explain',
  'compare',
  'contrast',
  'evaluate',
  'describe',
  'analyse',
  'analyze',
  'assess',
  'calculate',
  'justify',
  'discuss',
  'outline',
  'state',
  'identify',
  'name',
  'define',
  'summarise',
  'summarize',
  'show',
  'work',
  'working',
  'reason',
  'reasons',
  'why',
  'how',
  'give',
  'list',
  'find',
  'determine',
  'prove',
  'say',
  'tell',
])

// Keep extraction focused on meaningful subject terms, variables, and numbers.
const GENERIC_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'done',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'hers',
  'him',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'me',
  'may',
  'might',
  'more',
  'most',
  'must',
  'my',
  'no',
  'not',
  'of',
  'off',
  'on',
  'or',
  'our',
  'ours',
  'out',
  'over',
  'shall',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'too',
  'up',
  'us',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'without',
  'would',
  'you',
  'your',
  'yours',
  's',
  't',
  'd',
  'm',
  're',
  've',
  'll',
])

const PROMPT_FAMILIES = [
  {
    id: 'explain',
    label: 'Explain',
    questionPattern: /\b(explain|why|how(?:\s+(?:does|do|is|are))?|cause|causes|reason|reasons|because)\b/i,
    responsePattern: /\b(because|therefore|as a result|this shows|which means|so|since|due to|hence)\b/i,
  },
  {
    id: 'compare',
    label: 'Compare',
    questionPattern: /\b(compare|contrast|compare and contrast|similarities?|differences?|in contrast|whereas|while|both)\b/i,
    responsePattern: /\b(both|whereas|while|however|similarly|in contrast|difference|differences?|similar(?:ly)?|on the other hand)\b/i,
  },
  {
    id: 'evaluate',
    label: 'Evaluate',
    questionPattern: /\b(evaluate|assess|judge|judgement|judgment|to what extent|how far|weigh up)\b/i,
    responsePattern: /\b(overall|judgement|judgment|however|although|balance|weigh|more important|to a large extent|in conclusion)\b/i,
  },
  {
    id: 'describe',
    label: 'Describe',
    questionPattern: /\b(describe|outline|state|identify|name|give|what is|which is|list)\b/i,
    responsePattern: /\b(there is|there are|it is|shown by|has|contains|includes|features|is called|refers to|consists of)\b/i,
  },
  {
    id: 'analyse',
    label: 'Analyse',
    questionPattern: /\b(analyse|analyze|discuss|justify|summarise|summarize|interpret)\b/i,
    responsePattern: /\b(because|therefore|suggests|implies|shows|leads to|evidence|overall|in summary|on the other hand)\b/i,
  },
  {
    id: 'calculate',
    label: 'Calculate',
    questionPattern: /\b(calculate|work out|determine|find|show that|complete the calculation)\b/i,
    responsePattern: /\b(?:\d{2,}|\d+\.\d+|\d+\/\d+)\b|=|×|÷|working|formula|equation|substitut|solve|step(?:s)?|final answer/i,
  },
]

const PROMPT_FAMILY_FEEDBACK_TERMS = {
  explain: 'explanation',
  compare: 'comparison',
  evaluate: 'evaluation',
  describe: 'description',
  analyse: 'analysis',
  calculate: 'calculation',
}

const HEURISTIC_METHOD_MARK_NOTE =
  'Heuristic note: these method-mark signals suggest possible credit, but a human marker would still need to confirm the final award.'

function getPromptFamilyFeedbackTerm(promptFamily) {
  if (!promptFamily) {
    return ''
  }

  return PROMPT_FAMILY_FEEDBACK_TERMS[promptFamily.id] ?? promptFamily.label.toLowerCase()
}

function normaliseText(value) {
  return String(value ?? '').trim()
}

function extractKeywords(text) {
  const words =
    normaliseText(text)
      .toLowerCase()
      .replace(/[’']/g, '')
      .match(/\b(?:[a-z0-9]+(?:-[a-z0-9]+)*)\b/g) ?? []

  return words.filter((word) => !QUESTION_STOPWORDS.has(word) && !GENERIC_STOPWORDS.has(word))
}

function detectPromptFamily(questionText) {
  const question = normaliseText(questionText)
  return PROMPT_FAMILIES.find((family) => family.questionPattern.test(question)) ?? null
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
  const promptFamily = detectPromptFamily(question)
  const commandWord = promptFamily?.id ?? ''
  const questionKeywords = Array.from(
    new Set(extractKeywords(question).filter((keyword) => keyword !== commandWord)),
  )
  const answerKeywords = new Set(extractKeywords(answer))
  const matchedKeywords = questionKeywords.filter((keyword) => answerKeywords.has(keyword))
  const missingKeywords = questionKeywords.filter((keyword) => !answerKeywords.has(keyword))
  const usesCommandStyle = promptFamily ? promptFamily.responsePattern.test(answer) : false
  const keywordCoverage = questionKeywords.length ? matchedKeywords.length / questionKeywords.length : 0

  return {
    question,
    answer,
    questionKeywords,
    matchedKeywords,
    missingKeywords,
    commandWord,
    promptFamilyLabel: promptFamily?.label ?? '',
    promptFamilyFeedbackTerm: getPromptFamilyFeedbackTerm(promptFamily),
    usesCommandStyle,
    keywordCoverage,
  }
}

function getBoardSpecificFeedback(board, mode) {
  switch (board) {
    case 'AQA':
      return mode === 'essay'
        ? 'AQA responses often benefit from AO2 structure: keep each paragraph tightly linked to the question.'
        : 'AQA responses often benefit from showing each calculation step clearly and labelling working.'
    case 'Edexcel':
      return mode === 'essay'
        ? 'Edexcel responses often benefit from making the judgement explicit and supported by evidence.'
        : 'Edexcel responses often benefit from keeping substitutions and calculations easy to follow.'
    case 'OCR':
      return mode === 'essay'
        ? 'OCR responses often benefit from balancing evidence, explanation, and judgement across the response.'
        : 'OCR responses often benefit from a clear working trail and an explicit final conclusion.'
    case 'WJEC':
      return mode === 'essay'
        ? 'WJEC responses often benefit from points that clearly address the assessment objectives for the subject.'
        : 'WJEC maths/science marking often benefits from clear step-by-step methodology.'
    case 'CCEA':
      return mode === 'essay'
        ? 'CCEA responses often benefit from clearly signposted AO1/AO2/AO3 within the answer.'
        : 'CCEA method-mark responses often benefit from clearly shown working and a visible final answer.'
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
  const essayLength = text.split(/\s+/).filter(Boolean).length
  const questionAnalysis = buildQuestionAnalysis(questionText, text)

  if (!text) {
    return {
      maxMarks: 6,
      score: 0,
      ao1: ['You are ready to start — paste a student response and we can help shape it into stronger AO1 evidence.'],
      ao2: ['Even a short answer is enough to begin; adding more detail should make the AO2 feedback clearer.'],
      ao3: ['Once the response is pasted in, we can point out where judgement and evaluation can be strengthened.'],
      summary: topBand
        ? 'Top Band mode works best once an essay response is pasted in.'
        : 'Paste a response and we will give you encouraging, step-by-step essay feedback.',
    }
  }

  const length = essayLength
  const ao1 = []
  const ao2 = []
  const ao3 = []
  const pushUniqueFeedback = (feedbackList, message) => {
    if (message && !feedbackList.includes(message)) {
      feedbackList.push(message)
    }
  }
  let score = 0

  const hasAdequateLength = length >= 60
  const hasSustainedDevelopment = length >= 120
  const hasEvidenceDetail = /\b(example|examples|evidence|quote|quotes|statistic|statistics|fact|facts|terminology|term|terms|detail|specific|specifically|context)\b/i.test(text)
  const hasReasoning = /\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)
  const hasEvaluation = /\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)
  const hasStructure = /\n\s*\n/.test(text)

  if (hasAdequateLength) {
    ao1.push('The response length suggests sufficient detail for an assessment.')
  } else if (length > 0) {
    pushUniqueFeedback(ao1, 'Add more specific facts, quotes, examples, or terminology to improve the chance of AO1 credit.')
  }

  if (hasEvidenceDetail) {
    ao1.push('The response appears to use specific evidence, examples, or terminology, which may strengthen AO1.')
    score += 1
  } else {
    pushUniqueFeedback(ao1, 'Add more specific facts, quotes, examples, or terminology to improve the chance of AO1 credit.')
  }

  if (hasReasoning) {
    ao2.push('The response appears to explain ideas and link evidence to a point, which may support AO2.')
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
    ao3.push('The response appears to include some evaluation or judgement, which may help top-band criteria.')
    score += 1
  } else {
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      ao3.push(
        questionAnalysis.promptFamilyFeedbackTerm
          ? `The question calls for ${questionAnalysis.promptFamilyFeedbackTerm}, and your response shows that style clearly.`
          : `The question asks you to ${questionAnalysis.commandWord}, and your response shows that style clearly.`,
      )
    } else {
      ao3.push(
        questionAnalysis.promptFamilyFeedbackTerm
          ? `The question appears to call for more ${questionAnalysis.promptFamilyFeedbackTerm}, so add more of the matching style (reasoning, comparison, or evaluation).`
          : `The question asks you to ${questionAnalysis.commandWord}, so add more of the matching style (reasoning, comparison, or evaluation).`,
      )
    }
  }

  if (hasStructure) {
    ao3.push('Paragraph breaks suggest some structure.')
    score += 1
  } else {
    ao3.push('Consider using paragraph breaks to improve the structure of your essay.')
  }

  if (hasSustainedDevelopment) {
    // The sixth essay point is awarded for sustained development regardless of Top Band mode.
    score += 1
    ao3.push('Sustained development across the response may support top-band performance.')
    if (topBand) {
      ao3.push('Top Band mode: consider adding a sharp final judgement, embedding precise terminology, and making every paragraph move the argument forward.')
      ao2.push('Top Band mode: consider using linked chains of reasoning and comparison instead of listing points.')
      ao3.push('Top Band mode: consider refining paragraph sequencing, counterargument, and conclusion flow to maximise impact.')
    }
  } else if (hasAdequateLength) {
    ao3.push('The response has enough detail to assess, but it may need more sustained development to reach the top band.')
  } else if (topBand) {
    ao3.push('Top Band feedback works best when the essay is more fully developed (around 120 words or more).')
  }

  return {
    maxMarks: 6,
    score: Math.min(score, 6),
    ao1,
    ao2,
    ao3,
    summary: topBand
      ? hasSustainedDevelopment
        ? 'Grade 9 / Top Band focus: aim for precise, conceptual, and evaluative paragraphs.'
        : hasAdequateLength
          ? 'Top Band mode is on, but this response would benefit from more sustained development (120+ words) before full top-band feedback applies.'
          : 'Top Band mode is on, but this response is still too brief for full top-band feedback.'
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
      maxMarks: 9,
      score: 0,
      ao1: ['Heuristic method-mark checks suggest possible credit for the steps, working, and structure you show.'],
      ao2: ['Explaining each step clearly can help the marker follow the method trail.'],
      ao3: ['If this is a science question, including the key scientific idea, correct units, and any required conclusion can strengthen the response.'],
      summary: topBand
        ? 'Top Band mode works best once a maths/science response is pasted in.'
        : 'Method-mark feedback uses heuristic checks for visible working and correct process; a human marker would still need to confirm any award.',
      extra: [],
    }
  }

  const methodMarks = []
  const addMethodMark = (message) => {
    if (message && !methodMarks.includes(message)) {
      methodMarks.push(message)
    }
  }

  addMethodMark(HEURISTIC_METHOD_MARK_NOTE)

  let score = 0
  const hasVisibleCalculation = /(?:\b(?:\d+(?:\.\d+)?[a-z]?|[a-z])\s*=\s*(?:\d+(?:\.\d+)?[a-z]?|[a-z])\b|\b[a-z0-9]+(?:\s*[+\-×÷^\/]\s*[a-z0-9]+)+\b|=>|→)/i.test(text)
  const hasProcessLanguage = /\b(?:substitut(?:e|ion)|calculate|show\s+(?:your\s+work|the\s+working|working(?:\s+out)?)|working(?:\s+out)?|step(?:s)?|solve|method|equation|formula|check|verify|verified|recheck|recalculate|units)\b|→|=>/i.test(text)
  const hasWorkingTrail = hasVisibleCalculation && hasProcessLanguage
  const hasMethodTrace = hasVisibleCalculation || hasProcessLanguage
  const hasFormulaReference = /\b(formula|equation|substitut(?:e|ion)|calculation|ratio|proportion|graph|table|method)\b/i.test(text)
  const hasUnits = /\b(?:cm|mm|kg|g|mol|dm\^?3|°c|units)\b|(?:\d+\s*(?:m|s|n|j|w)\b)/i.test(text)
  const hasConclusion = /\b(?:therefore|consequently|ultimately|hence|which means|final answer|in conclusion)\b/i.test(text)
  const hasConceptualDetail = /\b(force|energy|mass|velocity|acceleration|reaction|atom|cell|graph|ratio|probability|mean|median|area|volume|gradient|current|voltage|resistance|density|wave|frequency|temperature|power|percentage|speed|distance|time|fraction|equation|function)\b/i.test(text)
  const hasVerification = /\b(check|checked|verify|verified|recheck|sensible|reasonable|plausible|substitut(?:e|ion)\s+back|back-substitute|sanity check)\b/i.test(text)
  const hasPromptFocus = questionAnalysis.questionKeywords.length
    ? questionAnalysis.matchedKeywords.length >= 2 || questionAnalysis.keywordCoverage >= 0.35
    : false
  const hasSustainedReasoning = text.split(/\s+/).filter(Boolean).length >= 100

  if (hasWorkingTrail) {
    score += 2
    addMethodMark('The working suggests more than one step, which may support method-mark credit.')
  } else if (hasMethodTrace) {
    score += 1
    addMethodMark('Showing the steps you used may help support method-mark credit.')
  } else if (hasFormulaReference) {
    score += 1
    addMethodMark('The formula or calculation path you reference may support method-mark credit.')
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to improve the chance of method-mark credit.')
  }

  if (hasUnits) {
    score += 1
    addMethodMark('The units or measurement language suggest the response is on the right track.')
  } else {
    addMethodMark('Include units where needed and keep the final answer contextualised.')
  }

  if (hasConclusion) {
    score += 1
    addMethodMark('The response appears to include a conclusion or final answer, which may help the top marks.')
  }

  if (hasConceptualDetail) {
    score += 1
    addMethodMark('The topic vocabulary suggests understanding of the topic, which may support credit.')
  }

  if (hasVerification) {
    score += 1
    addMethodMark('The checking language suggests verification, which may strengthen the method trail.')
  }

  if (hasPromptFocus) {
    score += 1
    const matchedSnippet = questionAnalysis.matchedKeywords.slice(0, 3).join(', ')
    addMethodMark(
      matchedSnippet
        ? `Question-aware heuristic: reusing key terms such as ${matchedSnippet} suggests the working stays on task.`
        : 'Question-aware heuristic: reusing key terms from the prompt suggests the working stays on task.',
    )
  } else if (questionAnalysis.questionKeywords.length) {
    const missingSnippet = questionAnalysis.missingKeywords.slice(0, 3).join(', ')
    addMethodMark(
      missingSnippet
        ? `Question-aware heuristic: use more of the prompt wording such as ${missingSnippet} so the method stays focused.`
        : 'Question-aware heuristic: use more of the prompt wording so the method stays focused.',
    )
  }

  if (hasSustainedReasoning) {
    score += 1
    addMethodMark('The response is long enough to suggest a fuller chain of reasoning.')
    if (topBand) {
      addMethodMark('Top Band mode: consider showing a full chain of reasoning, labelling substitutions, and checking the answer against sensible values.')
    }
  } else if (topBand) {
    addMethodMark('Top Band feedback works best when the answer is more fully developed (over 100 words).')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      addMethodMark(
        questionAnalysis.promptFamilyFeedbackTerm
          ? `The prompt appears to ask for more ${questionAnalysis.promptFamilyFeedbackTerm}, and your response shows that process clearly.`
          : `The prompt asks you to ${questionAnalysis.commandWord}, and your response shows that process clearly.`,
      )
    } else {
      addMethodMark(
        questionAnalysis.promptFamilyFeedbackTerm
          ? `The prompt appears to ask for more ${questionAnalysis.promptFamilyFeedbackTerm}, so make that method style more obvious in your working.`
          : `The prompt asks you to ${questionAnalysis.commandWord}, so make that method style more obvious in your working.`,
      )
    }
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'maths_science')
  if (boardSpecificFeedback) {
    addMethodMark(boardSpecificFeedback)
  }

  return {
    maxMarks: 9,
    score: Math.min(score, 9),
    ao1: ['Heuristic method-mark checks suggest possible credit for the steps, working, and structure you show; a marker would still confirm the award.'],
    ao2: ['Explaining each step clearly can help the marker follow the method trail.'],
    ao3: ['If this is a science question, including the key scientific idea, correct units, and any required conclusion can strengthen the response.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : 'Method-mark feedback uses heuristic checks for visible working and correct process; a human marker would still need to confirm any award.',
    extra: methodMarks,
  }
}
