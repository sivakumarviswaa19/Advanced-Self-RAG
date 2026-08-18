from ragas import EvaluationDataset,SingleTurnSample
from workflow import app

samples = [

    SingleTurnSample(
        user_input="What is the difference between a zombie process and an orphan process?",

        reference=(
            "A zombie is a process that has terminated but whose parent never invoked "
            "wait(), so its status information has not been collected. An orphan is a "
            "process whose parent terminated without invoking wait(), leaving the child "
            "running with no parent waiting on it."
        ),
    ),

    SingleTurnSample(
        user_input=(
            "Using FCFS scheduling with processes P0, P1, P2 and P3 having burst times "
            "of 10, 4, 8 and 6 ms and all arriving at time 0, what are the average "
            "turnaround time and the average waiting time?"
        ),

        reference=(
            "Completion times are P0=10, P1=14, P2=22, P3=28. Turnaround times are 10, "
            "14, 22 and 28 ms, giving an average turnaround time of 18.5 ms. Waiting "
            "times are 0, 10, 14 and 22 ms, giving an average waiting time of 11.5 ms."
        ),
    ),

    SingleTurnSample(
        user_input="What is starvation in priority scheduling, and how does aging address it?",

        reference=(
            "Starvation, also called indefinite blocking, is a phenomenon in priority "
            "scheduling where a process ready to run can wait indefinitely because its "
            "priority is too low. Aging solves this by increasing the priority of "
            "low-priority processes after a fixed amount of time quantum, so that as "
            "time passes a lower-priority process becomes a higher-priority process."
        ),
    ),
    SingleTurnSample(
        user_input="What information is stored in a Process Control Block?",

        reference=(
            "A PCB stores the process ID, process state, program counter, CPU registers, "
            "CPU scheduling information such as priorities and scheduling queue pointers, "
            "memory-management information, accounting information such as CPU used and "
            "elapsed clock time, and I/O status information such as allocated I/O devices "
            "and open files."
        ),
    ),

    SingleTurnSample(
        user_input="What are the multithreading models?",

        reference=(
            "The three multithreading models are Many-to-One, which maps many user-level "
            "threads to a single kernel thread; One-to-One, which maps each user-level "
            "thread to a kernel thread; and Many-to-Many, which maps many user-level "
            "threads to many kernel threads. A Two-level model is also described as a "
            "variant of Many-to-Many that additionally allows a user thread to be bound "
            "to a specific kernel thread."
        ),
    ),

    SingleTurnSample(
        user_input="Which CPU scheduling algorithms are covered, and which of them can be preemptive?",

        reference=(
            "The algorithms covered are First-Come First-Served (FCFS), Shortest-Job-First "
            "(SJF), Priority scheduling and Round-Robin. FCFS is nonpreemptive. SJF may be "
            "either preemptive or nonpreemptive, with the preemptive form called "
            "Shortest-Remaining-Time-First (SRTF). Priority scheduling may also be either "
            "preemptive or nonpreemptive. Round-Robin is preemptive, since a process is "
            "preempted when its time quantum expires."
        ),
    ),

    SingleTurnSample(
        user_input=(
            "How does the behaviour of fork() differ between a single-threaded process "
            "and a multithreaded process?"
        ),

        reference=(
            "For a single-threaded process, fork() creates a new process whose address "
            "space is a duplicate of the parent, and exec() is typically used afterwards "
            "to replace the process memory space with a new program. For a multithreaded "
            "process there is an ambiguity over whether fork() duplicates only the calling "
            "thread or all threads, and some UNIX systems therefore provide two versions "
            "of fork. exec() usually behaves as normal and replaces the running process "
            "including all of its threads."
        ),
    ),

    SingleTurnSample(
        user_input=(
            "Why do threads reduce the need for interprocess communication, and what IPC "
            "mechanisms would separate processes have to use instead?"
        ),
        reference=(
            "Threads are light-weight processes that share the same memory and state "
            "space, so they can share resources directly without needing IPC. Separate "
            "processes cannot do this and must use IPC, of which there are two models: "
            "shared memory, where an area of memory is shared between processes and "
            "synchronisation is controlled by the user processes rather than the operating "
            "system; and message passing, where processes exchange messages through direct "
            "or indirect communication, including ordinary and named pipes. The threads "
            "material also notes that IPC mechanisms are cumbersome, fine-grained "
            "synchronisation is difficult, and message passing is slow because each "
            "message may have to go through the kernel."
        ),
    ),

    SingleTurnSample(
        user_input="What is a deadlock, and what four conditions must hold simultaneously for one to occur?",
        reference=(
            "The provided documents do not contain this information. The corpus covers "
            "processes, interprocess communication, threads and CPU scheduling; deadlock "
            "and its necessary conditions are not discussed. The IPC material explicitly "
            "defers synchronisation topics to later chapters."
        )
    ),

    SingleTurnSample(
        user_input="What is the difference between paging and segmentation in memory management?",
        reference=(
            "The provided documents do not contain this information. The corpus covers "
            "process management, interprocess communication, threads and CPU scheduling "
            "algorithms, but does not cover memory-management schemes such as paging or "
            "segmentation."
        )
    ),

]

dataset=EvaluationDataset(samples=samples)

evaluated_dataset=[]

for sample in dataset.samples:

    result=app.invoke({"query":sample.user_input,"iterations":0})
    evaluated_dataset.append(
        SingleTurnSample(
            user_input=sample.user_input,
            reference=sample.reference,
            retrieved_contexts=[doc.page_content for doc in result["retrieved_chunks"]],
            response=result["final_ans"]
        )
    )

evaluation_dataset=EvaluationDataset(samples=evaluated_dataset)
