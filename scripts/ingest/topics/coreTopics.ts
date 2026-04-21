export type CoreTopicGroup = {
  group: string;
  topics: string[];
};

/**
 * Deep-ish "core coverage" topic map for broad library-style ingestion.
 * These are intentionally general enough to return volume, but specific enough
 * to avoid being overly shallow (e.g. not just "biology").
 */
export const CORE_TOPIC_GROUPS: CoreTopicGroup[] = [
  {
    group: 'Computing & information',
    topics: [
      'algorithms',
      'formal verification',
      'distributed systems',
      'operating systems',
      'databases',
      'computer networks',
      'cybersecurity',
      'cryptography',
      'software engineering',
      'programming languages',
      'compilers',
      'information retrieval',
      'knowledge graphs',
      'data mining',
      'data engineering',
      'machine learning',
      'deep learning',
      'reinforcement learning',
      'natural language processing',
      'computer vision',
      'human-computer interaction',
      'robotics',
      'internet of things'
    ]
  },
  {
    group: 'Mathematics & statistics',
    topics: [
      'optimization',
      'numerical analysis',
      'linear algebra',
      'graph theory',
      'combinatorics',
      'stochastic processes',
      'time series',
      'Bayesian inference',
      'causal inference',
      'experimental design'
    ]
  },
  {
    group: 'Physical sciences',
    topics: [
      'condensed matter physics',
      'quantum physics',
      'particle physics',
      'optics',
      'astrophysics',
      'physical chemistry',
      'organic chemistry',
      'analytical chemistry',
      'geoscience',
      'oceanography',
      'atmospheric science',
      'climate change'
    ]
  },
  {
    group: 'Life sciences',
    topics: [
      'genetics',
      'genomics',
      'molecular biology',
      'cell biology',
      'microbiology',
      'virology',
      'immunology',
      'neuroscience',
      'bioinformatics',
      'systems biology',
      'ecology',
      'evolution',
      'biodiversity',
      'conservation biology'
    ]
  },
  {
    group: 'Medicine & health',
    topics: [
      'oncology',
      'cardiology',
      'infectious disease',
      'epidemiology',
      'public health',
      'health policy',
      'clinical trial',
      'drug discovery',
      'pharmacology',
      'medical imaging',
      'psychiatry',
      'clinical psychology'
    ]
  },
  {
    group: 'Engineering & manufacturing',
    topics: [
      'signal processing',
      'telecommunications',
      'power systems',
      'smart grid',
      'mechanical engineering',
      'manufacturing',
      'advanced manufacturing',
      'additive manufacturing',
      'civil engineering',
      'structural engineering',
      'transportation engineering',
      'chemical engineering',
      'aerospace engineering',
      'operations research',
      'supply chain'
    ]
  },
  {
    group: 'Materials & energy',
    topics: [
      'materials science',
      'nanotechnology',
      'semiconductors',
      'batteries',
      'energy storage',
      'renewable energy',
      'solar energy',
      'wind energy',
      'carbon capture',
      'sustainability',
      'water resources'
    ]
  },
  {
    group: 'Agriculture & food',
    topics: ['agriculture', 'agronomy', 'crop science', 'soil science', 'food science', 'nutrition', 'fisheries', 'forestry']
  },
  {
    group: 'Business, economics & finance',
    topics: [
      'microeconomics',
      'macroeconomics',
      'labor economics',
      'development economics',
      'corporate finance',
      'asset pricing',
      'risk management',
      'fintech',
      'marketing',
      'entrepreneurship',
      'innovation management',
      'logistics'
    ]
  },
  {
    group: 'Social sciences',
    topics: [
      'political science',
      'international relations',
      'public administration',
      'sociology',
      'demography',
      'education research',
      'learning sciences',
      'communication studies',
      'media studies',
      'criminology'
    ]
  },
  {
    group: 'Law, governance & ethics',
    topics: ['regulation', 'intellectual property', 'privacy law', 'AI ethics', 'bioethics', 'governance', 'compliance']
  },
  {
    group: 'Humanities & built world',
    topics: [
      'history',
      'philosophy',
      'linguistics',
      'literature',
      'cultural studies',
      'religion',
      'art history',
      'architecture',
      'urban planning',
      'human geography',
      'design'
    ]
  }
];

export const CORE_TOPICS: string[] = CORE_TOPIC_GROUPS.flatMap((g) => g.topics);

// arXiv is not a general-purpose "all disciplines" corpus; this is a broad STEM spine.
export const ARXIV_CORE_QUERIES: string[] = [
  // Computer science
  'cat:cs.AI',
  'cat:cs.CL',
  'cat:cs.IR',
  'cat:cs.LG',
  'cat:cs.CV',
  'cat:cs.CR',
  'cat:cs.DS',
  'cat:cs.DB',
  'cat:cs.DC',
  'cat:cs.SE',
  // Math / stats
  'cat:math.ST',
  'cat:math.OC',
  'cat:stat.ML',
  'cat:stat.AP',
  // Physics
  'cat:physics.comp-ph',
  'cat:physics.data-an',
  'cat:cond-mat.mtrl-sci',
  'cat:quant-ph',
  // Electrical engineering & systems
  'cat:eess.SY',
  'cat:eess.SP',
  // Bio + finance + econ
  'cat:q-bio.BM',
  'cat:q-bio.QM',
  'cat:q-fin.TR',
  'cat:q-fin.ST',
  'cat:econ.EM',
  'cat:econ.TH'
];

