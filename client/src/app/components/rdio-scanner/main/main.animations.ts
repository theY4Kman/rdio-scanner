import { trigger, transition, style, animate, query, stagger, group } from '@angular/animations';

/**
 * Animation timings based on UX design recommendations
 * - Enter: 300ms with standard easing (items slide in from right)
 * - Exit: 200ms with accelerate easing (items fade out when played)
 * - Move: 250ms with decelerate easing (items slide left to fill space)
 * - Stagger: 50ms delay between multiple simultaneous entries
 */
const TIMING = {
    enter: '300ms cubic-bezier(0.4, 0.0, 0.2, 1)',
    exit: '200ms cubic-bezier(0.4, 0.0, 1, 1)',
    move: '250ms cubic-bezier(0.0, 0.0, 0.2, 1)',
    stagger: 50,
};

/**
 * Main animation trigger for queued call items
 * Handles enter (slide in from right), exit (fade out), and move (slide left)
 *
 * Uses GPU-accelerated properties (transform, opacity) for performance
 */
export const queuedCallAnimation = trigger('queuedCallAnimation', [
    // ENTER: New call slides in from right with subtle scale effect
    transition(':enter', [
        style({
            opacity: 0,
            transform: 'translateX(30px) scale(0.98)',
        }),
        group([
            animate(TIMING.enter, style({
                opacity: 1,
                transform: 'translateX(0) scale(1.0)',
            })),
        ]),
    ]),

    // EXIT: Call being removed fades out with scale down
    transition(':leave', [
        style({
            opacity: 1,
            transform: 'scale(1.0)',
        }),
        animate(TIMING.exit, style({
            opacity: 0,
            transform: 'scale(0.95)',
        })),
    ]),
]);

/**
 * Container animation for staggered entry of multiple calls
 * Applied to the parent container when items are added
 *
 * Creates a flowing effect when multiple calls are queued simultaneously
 */
export const queuedCallsStaggerAnimation = trigger('queuedCallsStagger', [
    transition('* => *', [
        // Query for new items entering
        query(':enter', [
            style({
                opacity: 0,
                transform: 'translateX(30px) scale(0.98)',
            }),
            stagger(TIMING.stagger, [
                animate(TIMING.enter, style({
                    opacity: 1,
                    transform: 'translateX(0) scale(1.0)',
                })),
            ]),
        ], { optional: true }), // optional: true prevents errors when no items are entering

        // Query for items leaving
        query(':leave', [
            animate(TIMING.exit, style({
                opacity: 0,
                transform: 'scale(0.95)',
            })),
        ], { optional: true }),
    ]),
]);

/**
 * Reduced motion variant for accessibility
 * Removes transform animations, keeps only opacity changes with shorter duration
 *
 * Activated when user has prefers-reduced-motion enabled
 */
export const queuedCallAnimationReducedMotion = trigger('queuedCallAnimationReduced', [
    transition(':enter', [
        style({ opacity: 0 }),
        animate('100ms linear', style({ opacity: 1 })),
    ]),
    transition(':leave', [
        animate('100ms linear', style({ opacity: 0 })),
    ]),
]);
