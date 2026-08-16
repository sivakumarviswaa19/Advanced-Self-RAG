from workflow import app

query="What are the multithreading models"

response=app.invoke({"query":query,"iterations":0})

print(response["final_ans"])