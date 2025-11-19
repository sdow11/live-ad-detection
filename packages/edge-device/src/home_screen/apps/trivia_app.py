"""Trivia Game App.

Interactive trivia game for bars and restaurants.
Supports multiple players, categories, and leaderboards.
"""

import asyncio
import json
import logging
import random
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pygame

from home_screen.app_framework import AppCategory, AppStatus, BaseApp

logger = logging.getLogger(__name__)


class TriviaApp(BaseApp):
    """Interactive trivia game application."""

    def __init__(self):
        """Initialize trivia app."""
        super().__init__(
            app_id="trivia",
            name="Trivia Night",
            description="Interactive trivia game with multiple categories",
            icon="🎯",
            category=AppCategory.GAMES,
            version="1.0.0"
        )

        self.screen = None
        self.running = False
        self.questions = []
        self.current_question_index = 0
        self.score = 0
        self.game_task = None

    async def start(self) -> bool:
        """Start trivia game.

        Returns:
            True if started successfully
        """
        try:
            logger.info("Starting trivia game")

            # Initialize pygame
            pygame.init()

            # Get display resolution (fullscreen)
            display_info = pygame.display.Info()
            screen_width = display_info.current_w
            screen_height = display_info.current_h

            # Create fullscreen window
            self.screen = pygame.display.set_mode(
                (screen_width, screen_height),
                pygame.FULLSCREEN
            )
            pygame.display.set_caption("Trivia Night")

            # Load questions
            self._load_questions()

            # Start game loop
            self.running = True
            self.game_task = asyncio.create_task(self._game_loop())

            self.status = AppStatus.RUNNING
            logger.info("Trivia game started successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to start trivia game: {e}", exc_info=True)
            self.error_message = str(e)
            self.status = AppStatus.ERROR
            return False

    async def stop(self) -> bool:
        """Stop trivia game.

        Returns:
            True if stopped successfully
        """
        try:
            logger.info("Stopping trivia game")

            self.running = False

            if self.game_task:
                self.game_task.cancel()
                try:
                    await self.game_task
                except asyncio.CancelledError:
                    pass

            if self.screen:
                pygame.quit()
                self.screen = None

            self.status = AppStatus.STOPPED
            logger.info("Trivia game stopped successfully")

            return True

        except Exception as e:
            logger.error(f"Failed to stop trivia game: {e}", exc_info=True)
            return False

    def _load_questions(self) -> None:
        """Load trivia questions from file or use defaults."""
        questions_file = Path(self.config.get("questions_file", "/var/lib/ad-detection/trivia/questions.json"))

        if questions_file.exists():
            try:
                with open(questions_file) as f:
                    data = json.load(f)
                    self.questions = data.get("questions", [])
                logger.info(f"Loaded {len(self.questions)} trivia questions")
            except Exception as e:
                logger.error(f"Failed to load questions file: {e}")
                self._load_default_questions()
        else:
            self._load_default_questions()

        # Shuffle questions
        random.shuffle(self.questions)

    def _load_default_questions(self) -> None:
        """Load default trivia questions."""
        self.questions = [
            {
                "question": "What is the capital of France?",
                "answers": ["Paris", "London", "Berlin", "Madrid"],
                "correct": 0,
                "category": "Geography"
            },
            {
                "question": "Who painted the Mona Lisa?",
                "answers": ["Leonardo da Vinci", "Michelangelo", "Raphael", "Donatello"],
                "correct": 0,
                "category": "Art"
            },
            {
                "question": "What is the largest planet in our solar system?",
                "answers": ["Jupiter", "Saturn", "Earth", "Mars"],
                "correct": 0,
                "category": "Science"
            },
            {
                "question": "In which year did World War II end?",
                "answers": ["1945", "1944", "1946", "1943"],
                "correct": 0,
                "category": "History"
            },
            {
                "question": "What is the chemical symbol for gold?",
                "answers": ["Au", "Ag", "Fe", "Cu"],
                "correct": 0,
                "category": "Science"
            },
            {
                "question": "Which country won the FIFA World Cup in 2018?",
                "answers": ["France", "Croatia", "Brazil", "Germany"],
                "correct": 0,
                "category": "Sports"
            },
            {
                "question": "Who wrote 'Romeo and Juliet'?",
                "answers": ["William Shakespeare", "Charles Dickens", "Jane Austen", "Mark Twain"],
                "correct": 0,
                "category": "Literature"
            },
            {
                "question": "What is the smallest prime number?",
                "answers": ["2", "1", "3", "5"],
                "correct": 0,
                "category": "Mathematics"
            }
        ]

        logger.info(f"Loaded {len(self.questions)} default questions")

    async def _game_loop(self) -> None:
        """Main game loop."""
        # Initialize fonts
        try:
            title_font = pygame.font.Font(None, 72)
            question_font = pygame.font.Font(None, 56)
            answer_font = pygame.font.Font(None, 48)
            score_font = pygame.font.Font(None, 40)
        except:
            # Fallback to system font
            title_font = pygame.font.SysFont("arial", 72)
            question_font = pygame.font.SysFont("arial", 56)
            answer_font = pygame.font.SysFont("arial", 48)
            score_font = pygame.font.SysFont("arial", 40)

        # Colors
        BG_COLOR = (20, 30, 50)
        TEXT_COLOR = (255, 255, 255)
        ANSWER_BG = (50, 70, 100)
        ANSWER_SELECTED = (80, 150, 200)
        CORRECT_COLOR = (50, 200, 50)
        WRONG_COLOR = (200, 50, 50)

        selected_answer = 0
        show_result = False
        result_timer = 0

        while self.running:
            # Handle events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False

                elif event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        self.running = False

                    elif not show_result:
                        if event.key == pygame.K_UP:
                            selected_answer = (selected_answer - 1) % 4
                        elif event.key == pygame.K_DOWN:
                            selected_answer = (selected_answer + 1) % 4
                        elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                            # Check answer
                            show_result = True
                            result_timer = 3  # Show result for 3 seconds

                            question = self.questions[self.current_question_index]
                            if selected_answer == question["correct"]:
                                self.score += 100

            # Clear screen
            self.screen.fill(BG_COLOR)

            if self.current_question_index < len(self.questions):
                question = self.questions[self.current_question_index]

                # Draw title
                title_text = title_font.render("TRIVIA NIGHT", True, TEXT_COLOR)
                title_rect = title_text.get_rect(centerx=self.screen.get_width() // 2, y=50)
                self.screen.blit(title_text, title_rect)

                # Draw score
                score_text = score_font.render(f"Score: {self.score}", True, TEXT_COLOR)
                score_rect = score_text.get_rect(x=50, y=50)
                self.screen.blit(score_text, score_rect)

                # Draw question number
                qnum_text = score_font.render(
                    f"Question {self.current_question_index + 1}/{len(self.questions)}",
                    True,
                    TEXT_COLOR
                )
                qnum_rect = qnum_text.get_rect(right=self.screen.get_width() - 50, y=50)
                self.screen.blit(qnum_text, qnum_rect)

                # Draw category
                category_text = answer_font.render(f"Category: {question['category']}", True, (150, 150, 255))
                category_rect = category_text.get_rect(centerx=self.screen.get_width() // 2, y=150)
                self.screen.blit(category_text, category_rect)

                # Draw question
                question_text = question_font.render(question["question"], True, TEXT_COLOR)
                question_rect = question_text.get_rect(centerx=self.screen.get_width() // 2, y=250)
                self.screen.blit(question_text, question_rect)

                # Draw answers
                answer_y = 400
                answer_height = 80
                answer_spacing = 20

                for i, answer in enumerate(question["answers"]):
                    # Determine color
                    if show_result:
                        if i == question["correct"]:
                            bg_color = CORRECT_COLOR
                        elif i == selected_answer and i != question["correct"]:
                            bg_color = WRONG_COLOR
                        else:
                            bg_color = ANSWER_BG
                    else:
                        bg_color = ANSWER_SELECTED if i == selected_answer else ANSWER_BG

                    # Draw answer box
                    answer_rect = pygame.Rect(
                        200,
                        answer_y + i * (answer_height + answer_spacing),
                        self.screen.get_width() - 400,
                        answer_height
                    )
                    pygame.draw.rect(self.screen, bg_color, answer_rect, border_radius=10)

                    # Draw answer text
                    answer_text = answer_font.render(f"{chr(65 + i)}. {answer}", True, TEXT_COLOR)
                    answer_text_rect = answer_text.get_rect(
                        centerx=answer_rect.centerx,
                        centery=answer_rect.centery
                    )
                    self.screen.blit(answer_text, answer_text_rect)

                # Draw instructions
                if not show_result:
                    instructions = "Use ↑↓ to select, ENTER to answer, ESC to exit"
                    inst_text = score_font.render(instructions, True, (150, 150, 150))
                    inst_rect = inst_text.get_rect(centerx=self.screen.get_width() // 2, bottom=self.screen.get_height() - 30)
                    self.screen.blit(inst_text, inst_rect)

                # Handle result timer
                if show_result:
                    result_timer -= 1 / 60  # Assuming 60 FPS

                    if result_timer <= 0:
                        show_result = False
                        selected_answer = 0
                        self.current_question_index += 1

            else:
                # Game over - show final score
                title_text = title_font.render("GAME OVER!", True, TEXT_COLOR)
                title_rect = title_text.get_rect(centerx=self.screen.get_width() // 2, y=200)
                self.screen.blit(title_text, title_rect)

                score_text = title_font.render(f"Final Score: {self.score}", True, (100, 255, 100))
                score_rect = score_text.get_rect(centerx=self.screen.get_width() // 2, y=350)
                self.screen.blit(score_text, score_rect)

                instructions = "Press ESC to exit"
                inst_text = answer_font.render(instructions, True, (150, 150, 150))
                inst_rect = inst_text.get_rect(centerx=self.screen.get_width() // 2, y=500)
                self.screen.blit(inst_text, inst_rect)

            # Update display
            pygame.display.flip()

            # Control frame rate
            await asyncio.sleep(1 / 60)  # 60 FPS

        logger.info(f"Trivia game ended. Final score: {self.score}")
