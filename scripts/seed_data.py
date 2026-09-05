import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, engine, Base
from app.db.models import (
    Participant, AdminUser, Competition, Round, CompetitionSetting,
    MCQQuestion, CodingProblem, CodingTestCase
)
from app.core.security import hash_pin

# ─────────────────────────────────────────────────────────
# REAL MCQ QUESTION BANKS — 28+ questions per academic year
# Each question is unique, topical, and has a verified answer
# ─────────────────────────────────────────────────────────

YEAR_1_QUESTIONS = [
    # Python Basics
    ("Python Basics", "EASY", "What is the output of `print(type(5))` in Python?", "<class 'int'>", "<class 'float'>", "<class 'number'>", "<class 'str'>", "A"),
    ("Python Basics", "EASY", "Which keyword is used to define a function in Python?", "function", "def", "func", "define", "B"),
    ("Python Basics", "EASY", "What does `len('Hello')` return?", "4", "6", "5", "Error", "C"),
    ("Python Basics", "MEDIUM", "What is the output of `'Python'[::-1]`?", "Python", "nohtyP", "Error", "None", "B"),
    ("Python Basics", "EASY", "Which of the following is a mutable data type in Python?", "tuple", "str", "list", "frozenset", "C"),
    # Data Structures
    ("Data Structures", "EASY", "Which data structure follows FIFO (First In First Out)?", "Stack", "Queue", "Array", "Tree", "B"),
    ("Data Structures", "EASY", "What is the time complexity of accessing an element by index in an array?", "O(n)", "O(log n)", "O(1)", "O(n²)", "C"),
    ("Data Structures", "MEDIUM", "Which data structure uses LIFO (Last In First Out) ordering?", "Queue", "Stack", "Heap", "Graph", "B"),
    ("Data Structures", "MEDIUM", "In a singly linked list, what is the time complexity of inserting at the beginning?", "O(n)", "O(log n)", "O(1)", "O(n²)", "C"),
    ("Data Structures", "EASY", "What is the maximum number of children a node can have in a binary tree?", "1", "2", "3", "Unlimited", "B"),
    # Mathematics
    ("Mathematics", "EASY", "What is the derivative of x²?", "x", "2x", "x²", "2x²", "B"),
    ("Mathematics", "EASY", "What is the value of log₂(8)?", "2", "4", "3", "8", "C"),
    ("Mathematics", "MEDIUM", "What is the determinant of a 2×2 identity matrix?", "0", "1", "2", "Undefined", "B"),
    ("Mathematics", "MEDIUM", "In a set of {1, 2, 3, 4, 5}, what is the variance?", "1", "2", "2.5", "3", "B"),
    ("Mathematics", "EASY", "What is the sum of the first 10 natural numbers?", "45", "55", "50", "100", "B"),
    # Computer Fundamentals
    ("Computer Fundamentals", "EASY", "What does CPU stand for?", "Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Control Processing Unit", "A"),
    ("Computer Fundamentals", "EASY", "How many bits are in one byte?", "4", "8", "16", "32", "B"),
    ("Computer Fundamentals", "EASY", "Which number system is used internally by computers?", "Decimal", "Octal", "Binary", "Hexadecimal", "C"),
    ("Computer Fundamentals", "MEDIUM", "What is the binary representation of the decimal number 13?", "1011", "1101", "1110", "1001", "B"),
    ("Computer Fundamentals", "MEDIUM", "Which logic gate returns TRUE only when all inputs are TRUE?", "OR", "XOR", "AND", "NAND", "C"),
    # Programming Logic
    ("Programming Logic", "EASY", "What is the output of `10 % 3` in most programming languages?", "3", "1", "0", "3.33", "B"),
    ("Programming Logic", "MEDIUM", "How many times will a `for i in range(5)` loop execute?", "4", "5", "6", "Infinite", "B"),
    ("Programming Logic", "MEDIUM", "What is the result of `True + True` in Python?", "True", "1", "2", "Error", "C"),
    ("Programming Logic", "HARD", "What is the output of `print(0.1 + 0.2 == 0.3)` in Python?", "True", "False", "Error", "None", "B"),
    ("Programming Logic", "MEDIUM", "Which sorting algorithm has the best average-case time complexity?", "Bubble Sort O(n²)", "Selection Sort O(n²)", "Merge Sort O(n log n)", "Insertion Sort O(n²)", "C"),
    # AI/ML Intro
    ("AI/ML Introduction", "EASY", "What does AI stand for?", "Automated Intelligence", "Artificial Intelligence", "Applied Integration", "Advanced Iteration", "B"),
    ("AI/ML Introduction", "EASY", "Which type of learning uses labeled training data?", "Unsupervised Learning", "Reinforcement Learning", "Supervised Learning", "Semi-supervised Learning", "C"),
    ("AI/ML Introduction", "MEDIUM", "What is a neural network inspired by?", "Computer circuits", "Human brain", "Internet architecture", "Database systems", "B"),
]

YEAR_2_QUESTIONS = [
    # Python Advanced
    ("Python Advanced", "MEDIUM", "What is the output of `bool([False])` in Python?", "False", "True", "TypeError", "None", "B"),
    ("Python Advanced", "MEDIUM", "What is the purpose of the `__init__` method in Python classes?", "Delete an object", "Initialize object attributes", "Import modules", "Define static methods", "B"),
    ("Python Advanced", "HARD", "What does `*args` represent in a Python function definition?", "Keyword arguments", "Variable positional arguments", "Default arguments", "Required arguments", "B"),
    ("Python Advanced", "MEDIUM", "Which built-in function creates an iterator of tuples from multiple iterables?", "enumerate()", "map()", "zip()", "filter()", "C"),
    ("Python Advanced", "HARD", "What is the output of `[x**2 for x in range(5) if x % 2 == 0]`?", "[0, 4, 16]", "[1, 9, 25]", "[0, 2, 4]", "[4, 16]", "A"),
    # Data Structures & Algorithms
    ("Data Structures", "EASY", "What is the average time complexity of searching in a balanced BST?", "O(1)", "O(n)", "O(log n)", "O(n log n)", "C"),
    ("Data Structures", "MEDIUM", "Which data structure is best for implementing a priority queue?", "Array", "Linked List", "Heap", "Stack", "C"),
    ("Data Structures", "MEDIUM", "What is the worst-case time complexity of QuickSort?", "O(n log n)", "O(n²)", "O(n)", "O(log n)", "B"),
    ("Data Structures", "HARD", "In a hash table with open addressing, what is the load factor threshold before resizing?", "0.5", "0.75", "0.9", "1.0", "B"),
    ("Data Structures", "MEDIUM", "Which traversal of a BST gives elements in sorted order?", "Pre-order", "Post-order", "In-order", "Level-order", "C"),
    # Machine Learning
    ("Machine Learning", "MEDIUM", "Which activation function is most prone to vanishing gradient?", "ReLU", "Leaky ReLU", "Sigmoid", "ELU", "C"),
    ("Machine Learning", "MEDIUM", "What is overfitting in machine learning?", "Model performs well on training and test data", "Model performs poorly on both datasets", "Model memorizes training data but fails on new data", "Model has too few parameters", "C"),
    ("Machine Learning", "EASY", "Which algorithm is commonly used for classification tasks?", "Linear Regression", "K-Means", "Logistic Regression", "PCA", "C"),
    ("Machine Learning", "MEDIUM", "What does the learning rate hyperparameter control?", "Number of training epochs", "Size of weight updates during gradient descent", "Number of hidden layers", "Batch size", "B"),
    ("Machine Learning", "HARD", "In K-fold cross-validation with K=5, how many times is each data point used for testing?", "1", "4", "5", "0", "A"),
    # Linear Algebra
    ("Linear Algebra", "MEDIUM", "If det(A) = 0, what is definitely true about matrix A?", "A is symmetric", "A is invertible", "A has eigenvalue 0", "A is positive definite", "C"),
    ("Linear Algebra", "MEDIUM", "What is the rank of a 3×3 identity matrix?", "1", "2", "3", "0", "C"),
    ("Linear Algebra", "EASY", "What is the transpose of a row vector?", "Row vector", "Column vector", "Scalar", "Matrix", "B"),
    ("Linear Algebra", "HARD", "Which decomposition factorizes A into Q·R where Q is orthogonal?", "LU Decomposition", "QR Decomposition", "SVD", "Cholesky", "B"),
    # Probability & Statistics
    ("Probability", "EASY", "What is P(rolling sum of 7 with two fair dice)?", "1/6", "1/12", "7/36", "5/36", "A"),
    ("Probability", "MEDIUM", "What is the expected value of a fair 6-sided die?", "3", "3.5", "4", "2.5", "B"),
    ("Probability", "MEDIUM", "In a normal distribution, approximately what % of data lies within 1 standard deviation?", "50%", "68%", "95%", "99.7%", "B"),
    ("Probability", "HARD", "What is Bayes' theorem used for?", "Calculating derivatives", "Updating probabilities with new evidence", "Finding eigenvalues", "Sorting data", "B"),
    # OOP
    ("OOP Concepts", "EASY", "Which OOP principle allows a child class to inherit from a parent?", "Encapsulation", "Polymorphism", "Inheritance", "Abstraction", "C"),
    ("OOP Concepts", "MEDIUM", "What is polymorphism in OOP?", "Hiding data", "One interface, many implementations", "Creating objects", "Data binding", "B"),
    ("OOP Concepts", "MEDIUM", "What is the difference between an abstract class and an interface?", "No difference", "Abstract class can have implementations; interface cannot", "Interface can be instantiated", "Abstract class has no methods", "B"),
    # Database
    ("Database", "EASY", "What does SQL stand for?", "Structured Query Language", "Simple Query Logic", "System Query Language", "Standard Question Language", "A"),
    ("Database", "MEDIUM", "Which SQL clause is used to filter grouped results?", "WHERE", "HAVING", "GROUP BY", "ORDER BY", "B"),
]

YEAR_3_QUESTIONS = [
    # Deep Learning
    ("Deep Learning", "MEDIUM", "What is the purpose of a convolutional layer in CNNs?", "Reduce dimensionality", "Extract spatial features using filters", "Normalize inputs", "Classify outputs", "B"),
    ("Deep Learning", "MEDIUM", "Which optimizer adapts learning rates per-parameter?", "SGD", "Adam", "Gradient Descent", "Newton's Method", "B"),
    ("Deep Learning", "HARD", "What problem does Batch Normalization primarily solve?", "Overfitting", "Internal covariate shift", "Vanishing gradients only", "Data augmentation", "B"),
    ("Deep Learning", "MEDIUM", "In a CNN, what does pooling do?", "Increase feature map size", "Reduce spatial dimensions", "Add noise", "Initialize weights", "B"),
    ("Deep Learning", "HARD", "What is the key innovation of ResNet architecture?", "Attention mechanism", "Skip/residual connections", "Dropout layers", "Larger kernels", "B"),
    # NLP
    ("NLP", "MEDIUM", "What does TF-IDF measure?", "Term frequency only", "Document similarity", "Word importance relative to a corpus", "Sentence structure", "C"),
    ("NLP", "MEDIUM", "Which architecture introduced the attention mechanism for NLP?", "LSTM", "CNN", "Transformer", "RNN", "C"),
    ("NLP", "HARD", "In word2vec, what does the Skip-gram model predict?", "The center word from context", "Context words from the center word", "Part-of-speech tags", "Named entities", "B"),
    ("NLP", "MEDIUM", "What is tokenization in NLP?", "Removing stop words", "Breaking text into smaller units", "Lemmatization", "Encoding text as numbers", "B"),
    ("NLP", "HARD", "What is the purpose of positional encoding in Transformers?", "Reduce model size", "Inject sequence order information", "Normalize attention weights", "Prevent overfitting", "B"),
    # Computer Vision
    ("Computer Vision", "MEDIUM", "What is the purpose of data augmentation in image classification?", "Reduce training time", "Artificially expand training dataset variety", "Improve test accuracy only", "Reduce model parameters", "B"),
    ("Computer Vision", "MEDIUM", "Which loss function is typically used for multi-class image classification?", "Binary Cross-Entropy", "MSE", "Categorical Cross-Entropy", "Hinge Loss", "C"),
    ("Computer Vision", "HARD", "What does Non-Maximum Suppression (NMS) do in object detection?", "Increases bounding boxes", "Removes redundant overlapping detections", "Normalizes pixel values", "Resizes images", "B"),
    ("Computer Vision", "MEDIUM", "What is transfer learning?", "Training from scratch", "Using pre-trained model weights for a new task", "Transferring data between datasets", "Moving models between GPUs", "B"),
    # Reinforcement Learning
    ("Reinforcement Learning", "MEDIUM", "What are the three core elements of reinforcement learning?", "Input, Output, Weight", "Agent, Environment, Reward", "Data, Model, Loss", "Feature, Label, Prediction", "B"),
    ("Reinforcement Learning", "HARD", "What does the Q-value represent in Q-learning?", "Quality of training data", "Expected cumulative reward for action in state", "Quantization error", "Query complexity", "B"),
    ("Reinforcement Learning", "MEDIUM", "What is the exploration-exploitation tradeoff?", "Speed vs accuracy", "Trying new actions vs using known good ones", "Training vs testing", "Bias vs variance", "B"),
    # Advanced Algorithms
    ("Algorithms", "MEDIUM", "What is the time complexity of Dijkstra's algorithm with a min-heap?", "O(V²)", "O(E log V)", "O(V + E)", "O(V·E)", "B"),
    ("Algorithms", "HARD", "Which algorithmic paradigm does dynamic programming use?", "Divide and conquer only", "Greedy approach", "Optimal substructure + overlapping subproblems", "Backtracking", "C"),
    ("Algorithms", "MEDIUM", "What is memoization?", "A type of data structure", "Caching previously computed results", "Memory optimization", "A sorting technique", "B"),
    # Statistics for ML
    ("Statistics for ML", "MEDIUM", "What does the R² score measure?", "Regression error", "Proportion of variance explained by the model", "Classification accuracy", "Feature importance", "B"),
    ("Statistics for ML", "HARD", "What is the curse of dimensionality?", "Too few features", "Performance degrades as feature dimensions increase", "Too much training data", "Model is too simple", "B"),
    ("Statistics for ML", "MEDIUM", "What is the purpose of regularization (L1/L2)?", "Speed up training", "Prevent overfitting by penalizing large weights", "Increase model complexity", "Reduce dataset size", "B"),
    # Python for Data Science
    ("Python for Data Science", "EASY", "Which Python library is primarily used for numerical computing?", "Pandas", "NumPy", "Matplotlib", "Scikit-learn", "B"),
    ("Python for Data Science", "MEDIUM", "What does `df.groupby('col').agg('mean')` do in Pandas?", "Sort by column", "Group rows and compute mean per group", "Filter rows", "Merge dataframes", "B"),
    ("Python for Data Science", "MEDIUM", "Which Matplotlib function creates a scatter plot?", "plt.bar()", "plt.scatter()", "plt.hist()", "plt.pie()", "B"),
    ("Python for Data Science", "EASY", "What is the purpose of `train_test_split` in scikit-learn?", "Merge datasets", "Split data into training and testing sets", "Normalize data", "Feature selection", "B"),
    ("Python for Data Science", "MEDIUM", "What does `sklearn.preprocessing.StandardScaler` do?", "One-hot encode features", "Scale features to zero mean and unit variance", "Remove missing values", "Reduce dimensionality", "B"),
]

YEAR_4_QUESTIONS = [
    # Advanced Deep Learning
    ("Advanced DL", "HARD", "What is the key mechanism in Generative Adversarial Networks (GANs)?", "Supervised classification", "Two networks (generator & discriminator) competing", "Single network self-training", "Clustering", "B"),
    ("Advanced DL", "HARD", "What does the Variational Autoencoder (VAE) loss function include?", "Only reconstruction loss", "Only KL divergence", "Reconstruction loss + KL divergence", "Cross-entropy only", "C"),
    ("Advanced DL", "HARD", "In self-attention, how are Q, K, V matrices computed?", "From the loss function", "By linear projections of the input", "From the output layer", "Randomly initialized and fixed", "B"),
    ("Advanced DL", "MEDIUM", "What is gradient clipping used for?", "Faster convergence", "Preventing exploding gradients", "Data augmentation", "Regularization", "B"),
    ("Advanced DL", "HARD", "What is knowledge distillation?", "Data preprocessing", "Training a small model to mimic a large model", "Feature extraction", "Pruning weights", "B"),
    # MLOps & Deployment
    ("MLOps", "MEDIUM", "What is model versioning used for?", "Deleting old models", "Tracking model iterations and reproducibility", "Training faster", "Reducing memory", "B"),
    ("MLOps", "MEDIUM", "What does CI/CD stand for in ML pipelines?", "Core Integration/Core Delivery", "Continuous Integration/Continuous Deployment", "Compute Intensive/Compute Distributed", "Cluster Init/Cluster Deploy", "B"),
    ("MLOps", "HARD", "What is data drift in production ML systems?", "Data gets larger over time", "Statistical properties of input data change over time", "Model weights shift", "Database corruption", "B"),
    ("MLOps", "MEDIUM", "Which tool is commonly used for experiment tracking in ML?", "Git only", "MLflow / Weights & Biases", "Excel", "Notepad", "B"),
    ("MLOps", "HARD", "What is A/B testing in model deployment?", "Training two models simultaneously", "Comparing two model versions on live traffic", "Alpha-Beta pruning", "Automated benchmarking", "B"),
    # Research Topics
    ("Research Topics", "HARD", "What is federated learning?", "Centralized training on one server", "Distributed training across devices without sharing raw data", "Transfer learning variant", "Ensemble method", "B"),
    ("Research Topics", "HARD", "What is the main advantage of Graph Neural Networks (GNNs)?", "Processing tabular data", "Learning from graph-structured data with node relationships", "Faster training than CNNs", "No hyperparameters needed", "B"),
    ("Research Topics", "HARD", "What does RLHF stand for in LLM fine-tuning?", "Recursive Learning from Human Features", "Reinforcement Learning from Human Feedback", "Regularized Learning with High Fidelity", "Residual Learning for Hybrid Functions", "B"),
    ("Research Topics", "HARD", "What is the purpose of LoRA in large model fine-tuning?", "Full parameter retraining", "Low-rank adaptation to reduce trainable parameters", "Learning rate optimization", "Loss regularization adaptation", "B"),
    ("Research Topics", "MEDIUM", "What is prompt engineering?", "Writing code faster", "Crafting effective inputs for LLMs to get desired outputs", "Building hardware prompts", "Memory management technique", "B"),
    # System Design for ML
    ("System Design", "MEDIUM", "What is the benefit of model quantization?", "Higher accuracy", "Reduced model size and faster inference", "More training data", "Better generalization", "B"),
    ("System Design", "HARD", "What is the CAP theorem?", "A machine learning optimization rule", "Distributed systems can guarantee at most 2 of: Consistency, Availability, Partition tolerance", "A neural network architecture", "A data preprocessing method", "B"),
    ("System Design", "MEDIUM", "What is containerization (e.g., Docker) used for in ML?", "Training models faster", "Packaging applications with dependencies for reproducibility", "Data visualization", "Feature engineering", "B"),
    ("System Design", "HARD", "What is the purpose of a feature store?", "Storing raw data", "Centralized repository for curated, reusable ML features", "A type of database", "Model checkpoint storage", "B"),
    # Ethics & Responsible AI
    ("AI Ethics", "MEDIUM", "What is algorithmic bias?", "A feature of all algorithms", "Systematic unfairness in model predictions across groups", "A type of regularization", "Intentional model behavior", "B"),
    ("AI Ethics", "MEDIUM", "What is explainability/interpretability in AI?", "Making models run faster", "Understanding why a model makes specific predictions", "Compressing model size", "Data anonymization", "B"),
    ("AI Ethics", "HARD", "What does SHAP stand for in model interpretability?", "Standard Hypothesis Analysis Protocol", "SHapley Additive exPlanations", "Stochastic Heuristic Approximate Processing", "Supervised Hybrid Attention Prediction", "B"),
    # Advanced Python & Engineering
    ("Advanced Python", "HARD", "What is the GIL in Python?", "A data structure", "Global Interpreter Lock preventing true multithreading", "A web framework", "A testing library", "B"),
    ("Advanced Python", "MEDIUM", "What is the difference between multiprocessing and multithreading in Python?", "No difference", "Multiprocessing uses separate memory spaces; multithreading shares memory", "Multithreading is always faster", "Multiprocessing only works on Linux", "B"),
    ("Advanced Python", "HARD", "What is a Python decorator?", "A design pattern for GUI", "A function that modifies another function's behavior", "A type of class", "An import statement", "B"),
    # Cloud & Distributed Computing
    ("Cloud Computing", "MEDIUM", "What does GPU stand for and why is it used for ML?", "General Processing Unit; cheaper", "Graphics Processing Unit; parallel computation", "Global Program Utility; networking", "Grid Power Unit; storage", "B"),
    ("Cloud Computing", "MEDIUM", "What is the purpose of distributed training in deep learning?", "Reduce accuracy", "Split computation across multiple GPUs/nodes for speed", "Increase data privacy", "Simplify model architecture", "B"),
    ("Cloud Computing", "HARD", "What is model sharding?", "Deleting model layers", "Splitting a large model across multiple devices", "Creating model copies", "Compressing model weights", "B"),
]

# ─────────────────────────────────────────────────────────
# CODING PROBLEMS with test cases
# ─────────────────────────────────────────────────────────

CODING_PROBLEMS = [
    {
        "title": "Max Subarray Sum (Kadane's Algorithm)",
        "description": (
            "Given an integer array `nums`, find the subarray with the largest sum, "
            "and return its sum.\n\n"
            "A subarray is a contiguous non-empty sequence of elements within an array.\n\n"
            "**Example 1:**\n"
            "Input: nums = [-2,1,-3,4,-1,2,1,-5,4]\n"
            "Output: 6\n"
            "Explanation: The subarray [4,-1,2,1] has the largest sum 6.\n\n"
            "**Example 2:**\n"
            "Input: nums = [1]\n"
            "Output: 1"
        ),
        "constraints": "1 <= nums.length <= 10^5\n-10^4 <= nums[i] <= 10^4",
        "time_limit_ms": 2000,
        "memory_limit_mb": 256,
        "marks": 20,
        "order_num": 1,
        "test_cases": [
            ("[-2,1,-3,4,-1,2,1,-5,4]", "6", False),
            ("[1]", "1", False),
            ("[5,4,-1,7,8]", "23", True),
            ("[-1,-2,-3,-4]", "-1", True),
        ]
    },
    {
        "title": "Two Sum",
        "description": (
            "Given an array of integers `nums` and an integer `target`, return the "
            "indices of the two numbers such that they add up to `target`.\n\n"
            "You may assume that each input would have exactly one solution, and you "
            "may not use the same element twice.\n\n"
            "Return the answer sorted in ascending order.\n\n"
            "**Example 1:**\n"
            "Input: nums = [2,7,11,15], target = 9\n"
            "Output: [0,1]\n"
            "Explanation: nums[0] + nums[1] = 2 + 7 = 9\n\n"
            "**Example 2:**\n"
            "Input: nums = [3,2,4], target = 6\n"
            "Output: [1,2]"
        ),
        "constraints": "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9",
        "time_limit_ms": 2000,
        "memory_limit_mb": 256,
        "marks": 20,
        "order_num": 2,
        "test_cases": [
            ("[2,7,11,15]\n9", "[0,1]", False),
            ("[3,2,4]\n6", "[1,2]", False),
            ("[3,3]\n6", "[0,1]", True),
            ("[1,5,3,7,2,8]\n10", "[1,3]", True),
        ]
    },
    {
        "title": "Valid Parentheses",
        "description": (
            "Given a string `s` containing just the characters `(`, `)`, `{`, `}`, "
            "`[` and `]`, determine if the input string is valid.\n\n"
            "An input string is valid if:\n"
            "1. Open brackets must be closed by the same type of brackets.\n"
            "2. Open brackets must be closed in the correct order.\n"
            "3. Every close bracket has a corresponding open bracket of the same type.\n\n"
            "Print `true` if valid, `false` otherwise.\n\n"
            "**Example 1:**\n"
            "Input: s = \"()\"\n"
            "Output: true\n\n"
            "**Example 2:**\n"
            "Input: s = \"(]\"\n"
            "Output: false"
        ),
        "constraints": "1 <= s.length <= 10^4\ns consists of parentheses only '()[]{}'",
        "time_limit_ms": 1000,
        "memory_limit_mb": 256,
        "marks": 20,
        "order_num": 3,
        "test_cases": [
            ("()", "true", False),
            ("()[]{}", "true", False),
            ("(]", "false", False),
            ("{[()]}", "true", True),
            ("((({{}}))[])(){}[]", "true", True),
            ("({[})", "false", True),
        ]
    },
    {
        "title": "Reverse Linked List",
        "description": (
            "Given the elements of a singly linked list as space-separated integers, "
            "reverse the list and print the reversed elements space-separated.\n\n"
            "**Example 1:**\n"
            "Input: 1 2 3 4 5\n"
            "Output: 5 4 3 2 1\n\n"
            "**Example 2:**\n"
            "Input: 1 2\n"
            "Output: 2 1\n\n"
            "**Example 3:**\n"
            "Input: 1\n"
            "Output: 1"
        ),
        "constraints": "1 <= number of elements <= 5000\n-5000 <= element value <= 5000",
        "time_limit_ms": 1000,
        "memory_limit_mb": 256,
        "marks": 20,
        "order_num": 4,
        "test_cases": [
            ("1 2 3 4 5", "5 4 3 2 1", False),
            ("1 2", "2 1", False),
            ("1", "1", True),
            ("10 20 30 40 50 60 70 80 90 100", "100 90 80 70 60 50 40 30 20 10", True),
        ]
    },
]


async def seed():
    print("=" * 60)
    print("  AI/ML Department Competition — Database Seeder")
    print("=" * 60)

    print("\n[1/7] Connecting to database & creating schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        res = await session.execute(select(Competition).limit(1))
        existing_comp = res.scalar_one_or_none()

        if existing_comp:
            print("[!] Database already seeded. Skipping. Delete competition.db to re-seed.")
            return

        # ── Competition & Rounds ──
        print("[2/7] Creating Competition & Rounds...")
        comp = Competition(
            name="AI/ML Annual Technical Fest 2026",
            description="Official departmental technical assessment competition — TechFest 2026, RGM College of Engineering & Technology"
        )
        session.add(comp)
        await session.flush()

        round_1 = Round(
            competition_id=comp.id,
            round_number=1,
            name="Level 01 · MCQ Assessment",
            is_open=True,
            duration_minutes=30
        )
        round_2 = Round(
            competition_id=comp.id,
            round_number=2,
            name="Level 02 · Coding Assessment",
            is_open=False,
            duration_minutes=60
        )
        session.add_all([round_1, round_2])
        await session.flush()

        # ── Competition Settings ──
        settings_data = [
            ("mcq_qualifying_cutoff", "18"),
            ("mcq_questions_per_attempt", "25"),
            ("mcq_duration_seconds", "1800"),
            ("coding_duration_seconds", "3600"),
            ("max_security_violations", "5"),
        ]
        for key, value in settings_data:
            session.add(CompetitionSetting(key=key, value=value))

        # ── Participants ──
        print("[3/7] Seeding 6 Participants...")
        participants_data = [
            ("21A91A6127", "anjali.rao@rgmcet.edu.in", "Anjali Rao", 3, "654321"),
            ("23AIML001", "aarav.sharma@aiml.edu", "Aarav Sharma", 2, "123456"),
            ("23AIML042", "diya.patel@aiml.edu", "Diya Patel", 2, "567890"),
            ("24AIML015", "rohan.verma@aiml.edu", "Rohan Verma", 1, "432100"),
            ("22AIML099", "ananya.iyer@aiml.edu", "Ananya Iyer", 3, "987654"),
            ("21AIML005", "vikram.malhotra@aiml.edu", "Vikram Malhotra", 4, "112233"),
        ]

        for roll, email, name, year, pin in participants_data:
            session.add(Participant(
                roll_number=roll,
                email=email,
                name=name,
                academic_year=year,
                hashed_pin=hash_pin(pin),
                is_enabled=True
            ))

        # ── Admin User ──
        print("[4/7] Seeding Admin User...")
        from app.core.security import hash_pin as hash_password  # reuse bcrypt hasher
        session.add(AdminUser(
            username="admin",
            email="admin@rgmcet.edu.in",
            hashed_password=hash_password("admin2026"),
            role="SUPERADMIN"
        ))

        # ── MCQ Questions ──
        print("[5/7] Seeding MCQ Question Bank...")
        all_questions = {
            1: YEAR_1_QUESTIONS,
            2: YEAR_2_QUESTIONS,
            3: YEAR_3_QUESTIONS,
            4: YEAR_4_QUESTIONS,
        }
        total_q = 0
        for year, questions in all_questions.items():
            for topic, difficulty, text, a, b, c, d, correct in questions:
                session.add(MCQQuestion(
                    academic_year=year,
                    topic=topic,
                    difficulty=difficulty,
                    question_text=text,
                    option_a=a,
                    option_b=b,
                    option_c=c,
                    option_d=d,
                    correct_option=correct,
                    is_active=True
                ))
                total_q += 1
            print(f"  [OK] Year {year}: {len(questions)} questions")
        print(f"  Total: {total_q} unique questions")

        # ── Coding Problems ──
        print("[6/7] Seeding Coding Problems & Test Cases...")
        total_tc = 0
        for prob_data in CODING_PROBLEMS:
            prob = CodingProblem(
                round_id=round_2.id,
                title=prob_data["title"],
                description=prob_data["description"],
                constraints=prob_data["constraints"],
                time_limit_ms=prob_data["time_limit_ms"],
                memory_limit_mb=prob_data["memory_limit_mb"],
                marks=prob_data["marks"],
                order_num=prob_data["order_num"]
            )
            session.add(prob)
            await session.flush()

            for idx, (inp, out, hidden) in enumerate(prob_data["test_cases"], 1):
                session.add(CodingTestCase(
                    problem_id=prob.id,
                    input_data=inp,
                    expected_output=out,
                    is_hidden=hidden,
                    order_num=idx
                ))
                total_tc += 1

            print(f"  [OK] {prob_data['title']} ({len(prob_data['test_cases'])} test cases)")
        print(f"  Total: {len(CODING_PROBLEMS)} problems, {total_tc} test cases")

        # ── Commit ──
        print("[7/7] Committing to database...")
        await session.commit()

        print("\n" + "=" * 60)
        print("  [OK] DATABASE SEEDED SUCCESSFULLY")
        print("=" * 60)
        print(f"  Competition : {comp.name}")
        print(f"  Rounds      : 2 (MCQ 30min, Coding 60min)")
        print(f"  Participants: {len(participants_data)}")
        print(f"  Admin Users : 1 (admin / admin2026)")
        print(f"  MCQ Bank    : {total_q} questions (Year 1-4)")
        print(f"  Coding      : {len(CODING_PROBLEMS)} problems, {total_tc} test cases")
        print(f"  Settings    : {len(settings_data)} config keys")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
