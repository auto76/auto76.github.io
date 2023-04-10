import random
import json

from flask import Flask, render_template, request

app = Flask(__name__)

white_possibles = list(range(1, 70))

red_possibles = list(range(1, 27))

tickets_per_drawing = request.form.get("tickets")
num_drawings = request.form.get("drawings")

total_spent = 0
earnings = 0

times_won = {
    "5+P": 0,
    "5": 0,
    "4+P": 0,
    "4": 0,
    "3+P": 0,
    "3": 0,
    "2+P": 0,
    "1+P": 0,
    "P": 0,
    "0": 0,
    }

@app.route("/")
def index():
    return render_template("main.html")

@app.route("/wins")
def wins(ticket_per_drawing, num_drawings):
    print(f'{tickets_per_drawing}')
    print(f'{num_drawings}')

    return "Click."

if __name__ == '__main__':
    app.run(debug=True)