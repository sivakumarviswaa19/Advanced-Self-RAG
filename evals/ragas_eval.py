from ragas.metrics import Faithfulness,ContextPrecision,ContextRecall
from ragas_dataset import evaluation_dataset

from openai import OpenAI
from ragas.llms import llm_factory

from ragas import evaluate

from dotenv import load_dotenv
import os
load_dotenv()



client=OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
eval_llm=llm_factory(model="gpt-4.1-mini",client=client)



result=evaluate(dataset=evaluation_dataset,
                metrics=[
                    Faithfulness(llm=eval_llm),
                    ContextPrecision(llm=eval_llm),
                    ContextRecall(llm=eval_llm),
                ])
print(result)