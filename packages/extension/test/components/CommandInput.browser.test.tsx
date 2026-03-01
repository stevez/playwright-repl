import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, RenderResult } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import CommandInput from '@/components/CommandInput';
import { addCommand, clearHistory } from '@/lib/command-history';

describe('CommandInput Component tests', () => {
    let onSubmit = vi.fn();
    let screen: RenderResult;

    beforeEach(async () => {
        clearHistory();
        onSubmit = vi.fn();
        screen = await render(<CommandInput onSubmit={onSubmit}/>);
    });

    it('should render the input', async () => {
        await expect.element(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should invoke callback when user type the Enter key', async () => {
        await screen.getByRole('textbox').fill('click e5');
        await userEvent.keyboard('{Enter}');

        expect(onSubmit).toHaveBeenLastCalledWith('click e5');
        await expect.element(screen.getByRole('textbox')).toHaveValue('');
    })

    it('should use ArrowUp to load the history command', async () => {
        addCommand('goto https://example.com');

        await screen.getByRole('textbox').fill('click e1');
        await userEvent.keyboard("{ArrowUp}");

        await expect.element(screen.getByRole('textbox')).toHaveValue('goto https://example.com');
    })

    it('should not change input when ArrowUp reach the beginning of the history command', async () => {
        addCommand('goto https://example.com');

        await screen.getByRole('textbox').click();
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowUp}");
        await expect.element(screen.getByRole('textbox')).toHaveValue('goto https://example.com');
    })

    it('should use ArrowDown to load the history command', async () => {
        addCommand('goto https://example.com');
        addCommand('click e1');

        await screen.getByRole('textbox').click();
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowDown}")
        await expect.element(screen.getByRole('textbox')).toHaveValue('click e1');
    })

    it('should not change input when ArrowDown reach the end of the history command', async () => {
        addCommand('goto https://example.com');
        addCommand('click e1');

        await screen.getByRole('textbox').click();
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowDown}")
        await expect.element(screen.getByRole('textbox')).toHaveValue('click e1');

        //reach to the end, clear the input box
        await userEvent.keyboard("{ArrowDown}");
        await expect.element(screen.getByRole('textbox')).toHaveValue('');

        // pass the index to history length, do nothing
        await userEvent.keyboard("{ArrowDown}");
        await expect.element(screen.getByRole('textbox')).toHaveValue('');
    })

     it('should not respond other key down event', async () => {
        await screen.getByRole('textbox').fill('goto https://example.com');
       
        await userEvent.keyboard('{Escape}');
        await expect.element(screen.getByRole('textbox')).toHaveValue('goto https://example.com');
    })

    it('should show ghost text o-back when user type g', async () => {
        await screen.getByRole('textbox').fill('g');

        await expect.element(screen.getByTestId('ghost-text')).toBeInTheDocument();
    })
    it('should fill the ghost text by pressing the TAB key', async () => {
        await screen.getByRole('textbox').fill('g');
        await userEvent.keyboard('{Tab}');
        
        await expect.element(screen.getByRole('textbox')).toHaveValue('go-back');
    })

    it('should not fill the input when pressing the TAB key but no ghost text', async () => {
        await screen.getByRole('textbox').fill('zzz');
        await userEvent.keyboard('{Tab}');
        
        await expect.element(screen.getByRole('textbox')).toHaveValue('zzz');
    })
    it('should show auto complete dropdown when user type a character g', async () => {
        await screen.getByRole('textbox').fill('g');

        const dropdown = screen.getByTestId('autocomplete-dropdown');
        await expect.element(dropdown).toHaveTextContent('go-back');
        await expect.element(dropdown).toHaveTextContent('go-forward');
        await expect.element(dropdown).toHaveTextContent('goto');
    })

    it('should fill the input by clicking an item in the autocomplete dropdown item', async () => {
        await screen.getByRole('textbox').fill('g');
        // DOM click — Playwright click fails because the dropdown renders
        // above the input (bottom:100%) and overflows the test iframe viewport
        (screen.getByText('goto').element() as HTMLElement).click();
        await expect.element(screen.getByRole('textbox')).toHaveValue('goto');
    })

    it('should select auto complete drop down items by using ArrowDown key', async () => {
        await screen.getByRole('textbox').fill('g');
        await userEvent.keyboard('{ArrowDown}');

        const dropdown = screen.getByTestId('autocomplete-dropdown');
        await expect.element(dropdown.getByText('go-back')).toHaveAttribute('data-active', 'true');

        await userEvent.keyboard('{ArrowDown}');
        await expect.element(dropdown.getByText('go-forward')).toHaveAttribute('data-active', 'true');

        await userEvent.keyboard('{ArrowDown}');
        await expect.element(dropdown.getByText('goto')).toHaveAttribute('data-active', 'true');

        // go to the bottom of the dropdown and stay
        await userEvent.keyboard('{ArrowDown}');
        await expect.element(dropdown.getByText('goto')).toHaveAttribute('data-active', 'true');
    })

    it('should select auto complete drop down items by using ArrowUp key', async () => {
        await screen.getByRole('textbox').fill('g');
        await userEvent.keyboard('{ArrowUp}');

        const dropdown = screen.getByTestId('autocomplete-dropdown');

        // alway first item is to be active
        await expect.element(dropdown.getByText('go-back')).toHaveAttribute('data-active', 'true');

        // index will not be changed if it is in the head already
        await userEvent.keyboard('{ArrowUp}');
        await expect.element(dropdown.getByText('go-back')).toHaveAttribute('data-active', 'true');

        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{ArrowDown}');

        await userEvent.keyboard('{ArrowUp}');
        await expect.element(dropdown.getByText('go-forward')).toHaveAttribute('data-active', 'true');
       ;
    })

    it('should clear the input when user type the Escape key', async () => {
        await screen.getByRole('textbox').fill('g');
        await userEvent.keyboard('{Escape}');

        await expect.element(screen.getByRole('textbox')).toHaveValue('');

    })

    it('should fill the input when user Press Enter when the autocomplete dropdown active', async () => {
         await screen.getByRole('textbox').fill('g');

          await userEvent.keyboard('{ArrowDown}');
          await userEvent.keyboard('{Enter}');

          await expect.element(screen.getByRole('textbox')).toHaveValue('go-back');
    })

     it('should not fill the input when user Press Enter when the autocomplete dropdown not active', async () => {
         await screen.getByRole('textbox').fill('g');

         await userEvent.keyboard('{Enter}');
 
         await expect.element(screen.getByRole('textbox')).toHaveValue('');
         expect(onSubmit).toHaveBeenCalledWith('g');
          
    })
})